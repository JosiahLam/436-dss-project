"""BAKE-OFF under an honest walk-forward, episode-deduplicated protocol.

Runs end-to-end and prints the final tables. Writes:
  results_ablation.csv  - label/feature/model attribution ablation (per-fold + aggregated)
  results_bakeoff.csv   - full model bake-off on new-label + new-features (per-fold + aggregated)

Protocol
  Walk-forward by year. For train_end_year Y in {2018..2023}:
    * TRAIN on labeled rows whose forward label window closes on/before end of year Y,
      i.e. date <= (Dec 31, Y) - 12 months  ->  a full-year embargo (year Y) sits between
      train and the evaluation year to prevent the 12m label horizon leaking.
    * EVALUATE on year Y+1, EPISODE-DEDUPLICATED: positives = each episode's ONSET row
      (first positive month) only; negatives = stride-6 (non-overlapping) negative rows.
  Metrics: PR-AUC (primary; prevalence floor reported beside it), ROC-AUC, precision@top-10%.
  Reported as mean +/- std across the 6 folds.

Chosen LABEL v2 spec: TTM run-rate, thr=0.10, fwd=12, censor_guard=2 (see report.md).
"""
from __future__ import annotations

import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

REPO = "/home/user/436-dss-project"
sys.path.insert(0, os.path.join(REPO, "backend"))
HERE = os.path.dirname(os.path.abspath(__file__))

import label_v2 as L
import features_v2 as F

from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import lightgbm as lgb
import xgboost as xgb
from catboost import CatBoostClassifier

RANDOM_STATE = 0
CHOSEN = dict(thr=0.10, fwd=12, mode="ttm")
TRAIN_END_YEARS = [2018, 2019, 2020, 2021, 2022, 2023]


# --------------------------------------------------------------------------- #
# Panels
# --------------------------------------------------------------------------- #
def build_old_feature_panel(raw: dict) -> pd.DataFrame:
    """Production features (incl. expense_ratio) + production label, keyed by (ticker,date)."""
    from app import config
    from app.features import build_features as bf
    from app.data.ingest import _CAT_PARAMS

    frames = []
    for t, rec in raw.items():
        attrs = {
            "expense_ratio": _CAT_PARAMS[rec["category"]].expense_ratio,
            "age_months": len(rec["prices"]),
            "last_price": float(rec["prices"].iloc[-1]),
        }
        f = bf.feature_frame(t, rec["prices"], rec["divs"], attrs, config.META[t])
        f = f.reset_index().rename(columns={"index": "date"})
        if "date" not in f.columns:
            f["date"] = rec["prices"].index
        frames.append(f)
    old = pd.concat(frames, ignore_index=True)
    old["old_payout_trend"] = old["payout_trend"]  # copy for the old-feature dumb rule
    # namespace old feature columns (o_*) so they never collide with v2 features on merge
    ren = {c: f"o_{c}" for c in bf.FEATURE_COLUMNS}
    ren["label"] = "label_old"
    old = old.rename(columns=ren)
    old_cols = [f"o_{c}" for c in bf.FEATURE_COLUMNS]
    keep = ["ticker", "date", "label_old", "old_payout_trend"] + old_cols
    return old[keep], old_cols


def build_master(raw: dict) -> tuple[pd.DataFrame, list]:
    """Merge v2 features + v2 label + old features + old label on (ticker, date)."""
    feat = F.build_feature_panel(raw)
    feat["date"] = pd.to_datetime(feat["date"])

    # v2 label (chosen spec)
    lab = L.label_panel(raw, CHOSEN["thr"], CHOSEN["fwd"], CHOSEN["mode"])[["ticker", "date", "label"]]
    lab["date"] = pd.to_datetime(lab["date"])
    lab = lab.rename(columns={"label": "label_new"})

    old_panel, old_cols = build_old_feature_panel(raw)
    old_panel["date"] = pd.to_datetime(old_panel["date"])

    m = feat.merge(lab, on=["ticker", "date"], how="left")
    m = m.merge(old_panel, on=["ticker", "date"], how="left", suffixes=("", "_old"))
    m["year"] = m["date"].dt.year
    return m, old_cols


# --------------------------------------------------------------------------- #
# Episode-deduplicated evaluation set
# --------------------------------------------------------------------------- #
def dedup_eval_index(master: pd.DataFrame, label_col: str, eval_year: int) -> list:
    """Return row-indices for the deduped eval set: episode-onset positives + stride-6 negatives,
    all within `eval_year`. Onset computed over the full per-ticker time series."""
    keep = []
    for _, g in master.groupby("ticker"):
        g = g.sort_values("date")
        lab = g[label_col].values
        yr = g["year"].values
        idx = g.index.values
        prev = 0
        for i in range(len(g)):
            is_pos = lab[i] == 1
            if is_pos and prev != 1 and yr[i] == eval_year:
                keep.append(idx[i])
            prev = 1 if is_pos else 0
        negmask = (lab == 0) & (yr == eval_year)
        neg_idx = idx[negmask]
        keep.extend(neg_idx[::6].tolist())
    return keep


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
def _histgb():
    return HistGradientBoostingClassifier(
        max_depth=3, learning_rate=0.08, max_iter=300, l2_regularization=1.0,
        min_samples_leaf=15, random_state=RANDOM_STATE)


def _lr():
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(class_weight="balanced", max_iter=2000))])


def _rf():
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("rf", RandomForestClassifier(
            n_estimators=500, max_depth=6, class_weight="balanced_subsample",
            n_jobs=-1, random_state=RANDOM_STATE))])


def _inner_temporal_val(dates: pd.Series, frac: float = 0.15):
    """Boolean mask for the last `frac` of training rows by date (for early stopping)."""
    d = pd.to_datetime(dates)
    cut = d.quantile(1 - frac)
    return (d > cut).values


def fit_predict(name: str, Xtr: pd.DataFrame, ytr: np.ndarray, dates_tr: pd.Series,
                Xte: pd.DataFrame) -> np.ndarray:
    ytr = np.asarray(ytr).astype(int)
    n_pos = int(ytr.sum())
    n_neg = len(ytr) - n_pos
    spw = (n_neg / max(n_pos, 1))

    if name == "LogReg":
        m = _lr().fit(Xtr, ytr)
        return m.predict_proba(Xte)[:, 1]
    if name == "RandomForest":
        m = _rf().fit(Xtr, ytr)
        return m.predict_proba(Xte)[:, 1]
    if name == "HistGB":
        m = _histgb().fit(Xtr, ytr)
        return m.predict_proba(Xte)[:, 1]

    # gradient boosters with inner temporal early stopping
    vmask = _inner_temporal_val(dates_tr)
    use_es = vmask.sum() >= 5 and ytr[vmask].sum() >= 1 and ytr[~vmask].sum() >= 1
    Xf, yf = (Xtr[~vmask], ytr[~vmask]) if use_es else (Xtr, ytr)
    Xv, yv = (Xtr[vmask], ytr[vmask]) if use_es else (None, None)

    if name == "LightGBM":
        m = lgb.LGBMClassifier(
            n_estimators=600, learning_rate=0.05, num_leaves=15, max_depth=4,
            min_child_samples=20, subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
            scale_pos_weight=spw, n_jobs=-1, random_state=RANDOM_STATE, verbose=-1)
        if use_es:
            m.fit(Xf, yf, eval_set=[(Xv, yv)], eval_metric="average_precision",
                  callbacks=[lgb.early_stopping(50, verbose=False)])
        else:
            m.fit(Xf, yf)
        return m.predict_proba(Xte)[:, 1]

    if name == "XGBoost":
        m = xgb.XGBClassifier(
            n_estimators=600, learning_rate=0.05, max_depth=4, min_child_weight=5,
            subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0, scale_pos_weight=spw,
            n_jobs=-1, random_state=RANDOM_STATE, eval_metric="aucpr",
            early_stopping_rounds=50 if use_es else None, tree_method="hist")
        if use_es:
            m.fit(Xf, yf, eval_set=[(Xv, yv)], verbose=False)
        else:
            m.fit(Xf, yf, verbose=False)
        return m.predict_proba(Xte)[:, 1]

    if name == "CatBoost":
        m = CatBoostClassifier(
            iterations=600, learning_rate=0.05, depth=5, l2_leaf_reg=3.0,
            auto_class_weights="Balanced", random_seed=RANDOM_STATE, verbose=False,
            early_stopping_rounds=50 if use_es else None, allow_writing_files=False)
        if use_es:
            m.fit(Xf, yf, eval_set=(Xv, yv))
        else:
            m.fit(Xf, yf)
        return m.predict_proba(Xte)[:, 1]

    raise ValueError(name)


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def metrics(y: np.ndarray, s: np.ndarray) -> dict:
    y = np.asarray(y).astype(int)
    s = np.asarray(s, dtype=float)
    out = {"n": len(y), "pos": int(y.sum()), "prevalence": float(y.mean()) if len(y) else np.nan}
    if y.sum() == 0 or y.sum() == len(y):
        out["pr_auc"] = np.nan
        out["roc_auc"] = np.nan
    else:
        out["pr_auc"] = average_precision_score(y, s)
        out["roc_auc"] = roc_auc_score(y, s)
    k = max(1, int(round(0.10 * len(y))))
    top = np.argsort(-s)[:k]
    out["prec_at_10"] = float(y[top].mean())
    return out


# --------------------------------------------------------------------------- #
# One walk-forward run for a (label, features, model) configuration
# --------------------------------------------------------------------------- #
def run_config(master: pd.DataFrame, label_col: str, feat_cols: list, model_name: str,
               dumb_col: str | None = None, stride3: bool = False) -> pd.DataFrame:
    rows = []
    for Y in TRAIN_END_YEARS:
        eval_year = Y + 1
        train_cut = pd.Timestamp(year=Y, month=12, day=31) - pd.DateOffset(months=12)

        tr = master[(master["date"] <= train_cut) & master[label_col].notna()].copy()
        if stride3:
            # per-ticker stride-3 subsampling of training rows (variance-reduction ablation)
            tr = tr.sort_values(["ticker", "date"]).groupby("ticker", group_keys=False).apply(
                lambda g: g.iloc[::3])
        if tr[label_col].nunique() < 2 or tr[label_col].sum() < 3:
            continue

        eval_idx = dedup_eval_index(master, label_col, eval_year)
        te = master.loc[eval_idx]
        te = te[te[label_col].notna()]
        if len(te) == 0 or te[label_col].nunique() < 2:
            continue

        Xtr, ytr = tr[feat_cols], tr[label_col].values
        Xte, yte = te[feat_cols], te[label_col].values

        if model_name == "DumbRule":
            s = (-te[dumb_col].fillna(0.0)).values
        else:
            s = fit_predict(model_name, Xtr, ytr, tr["date"], Xte)

        mt = metrics(yte, s)
        mt.update({"train_end": Y, "eval_year": eval_year, "model": model_name,
                   "label": label_col, "train_rows": len(tr), "train_pos": int(ytr.sum())})
        rows.append(mt)
    return pd.DataFrame(rows)


def aggregate(df: pd.DataFrame, tag: str) -> dict:
    return {
        "config": tag,
        "folds": len(df),
        "pr_auc_mean": df["pr_auc"].mean(), "pr_auc_std": df["pr_auc"].std(),
        "roc_auc_mean": df["roc_auc"].mean(), "roc_auc_std": df["roc_auc"].std(),
        "prec10_mean": df["prec_at_10"].mean(), "prec10_std": df["prec_at_10"].std(),
        "prevalence_mean": df["prevalence"].mean(),
    }


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    raw = L.load_raw()
    master, OLD_COLS = build_master(raw)
    NEW_COLS = F.FEATURE_COLUMNS_V2
    print(f"master panel: {len(master)} rows, {master['ticker'].nunique()} funds")
    print(f"  label_new positives: {int(master['label_new'].sum())} / {int(master['label_new'].notna().sum())} labeled")
    print(f"  label_old positives: {int(master['label_old'].sum())} / {int(master['label_old'].notna().sum())} labeled")

    # ---------- feature-target correlation (train-era only: year <= 2021) ----------
    tr_era = master[(master["year"] <= 2021) & master["label_new"].notna()]
    corr_rows = []
    for c in NEW_COLS:
        v = tr_era[c]
        if v.nunique() > 1:
            corr = np.corrcoef(v.fillna(v.median()), tr_era["label_new"])[0, 1]
        else:
            corr = np.nan
        corr_rows.append({"feature": c, "corr_with_cut": round(corr, 4), "abs": abs(corr)})
    corr_tbl = pd.DataFrame(corr_rows).sort_values("abs", ascending=False).drop(columns="abs")
    corr_tbl.to_csv(os.path.join(HERE, "feature_corr.csv"), index=False)

    # ---------- ABLATION ----------
    ab_folds = []
    ab_agg = []
    specs = [
        ("old-label + old-feat + HistGB", "label_old", OLD_COLS, "HistGB"),
        ("new-label + old-feat + HistGB", "label_new", OLD_COLS, "HistGB"),
        ("new-label + new-feat + HistGB", "label_new", NEW_COLS, "HistGB"),
    ]
    for tag, lab, cols, mdl in specs:
        d = run_config(master, lab, cols, mdl)
        d["config"] = tag
        ab_folds.append(d)
        ab_agg.append(aggregate(d, tag))
    ab_folds = pd.concat(ab_folds, ignore_index=True)
    ab_agg = pd.DataFrame(ab_agg)
    ab_folds.to_csv(os.path.join(HERE, "results_ablation.csv"), index=False)

    # ---------- FULL BAKE-OFF (new label + new features) ----------
    models = ["LogReg", "RandomForest", "HistGB", "LightGBM", "XGBoost", "CatBoost", "DumbRule"]
    bo_folds = []
    bo_agg = []
    for mdl in models:
        d = run_config(master, "label_new", NEW_COLS, mdl, dumb_col=F.DUMB_FEATURE)
        d["config"] = mdl
        bo_folds.append(d)
        bo_agg.append(aggregate(d, mdl))
    # stride-3 training ablation for the best PR-AUC model
    bo_agg_df = pd.DataFrame(bo_agg)
    best = bo_agg_df[bo_agg_df["config"] != "DumbRule"].sort_values("pr_auc_mean", ascending=False).iloc[0]["config"]
    d_s3 = run_config(master, "label_new", NEW_COLS, best, stride3=True)
    d_s3["config"] = f"{best}+stride3"
    bo_folds.append(d_s3)
    bo_agg.append(aggregate(d_s3, f"{best} (stride-3 train)"))

    bo_folds = pd.concat(bo_folds, ignore_index=True)
    bo_agg = pd.DataFrame(bo_agg)
    bo_folds.to_csv(os.path.join(HERE, "results_bakeoff.csv"), index=False)

    # ---------- print ----------
    pd.set_option("display.width", 200, "display.max_columns", 30)

    def fmt(a):
        a = a.copy()
        for col in ["pr_auc_mean", "pr_auc_std", "roc_auc_mean", "roc_auc_std",
                    "prec10_mean", "prec10_std", "prevalence_mean"]:
            a[col] = a[col].round(3)
        a["PR-AUC (mean±std)"] = a["pr_auc_mean"].astype(str) + " ± " + a["pr_auc_std"].astype(str)
        a["ROC-AUC (mean±std)"] = a["roc_auc_mean"].astype(str) + " ± " + a["roc_auc_std"].astype(str)
        a["prec@10% (mean±std)"] = a["prec10_mean"].astype(str) + " ± " + a["prec10_std"].astype(str)
        return a[["config", "folds", "PR-AUC (mean±std)", "ROC-AUC (mean±std)",
                  "prec@10% (mean±std)", "prevalence_mean"]]

    print("\n" + "=" * 90)
    print("FEATURE-TARGET CORRELATION (train era, year<=2021, new label)")
    print("=" * 90)
    print(corr_tbl.to_string(index=False))

    print("\n" + "=" * 90)
    print("ABLATION (HistGB, walk-forward, episode-deduplicated eval)")
    print("=" * 90)
    print(fmt(ab_agg).to_string(index=False))

    print("\n" + "=" * 90)
    print("BAKE-OFF (new label + new features, walk-forward, episode-deduplicated eval)")
    print("=" * 90)
    print(fmt(bo_agg).to_string(index=False))
    print("\nPrevalence floor (mean deduped test positive rate) = PR-AUC of a random ranker.")

    # persist aggregated tables too
    ab_agg.to_csv(os.path.join(HERE, "results_ablation_agg.csv"), index=False)
    bo_agg.to_csv(os.path.join(HERE, "results_bakeoff_agg.csv"), index=False)
    return corr_tbl, ab_agg, bo_agg, bo_folds


if __name__ == "__main__":
    main()
