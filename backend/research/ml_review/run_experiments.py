"""E1 (exclusion-budget vs cut-avoidance curve) + E2 (internal macro-proxy ablation).

Reuses the bakeoff walk-forward protocol wholesale:
  - build_master / dedup_eval_index / fit_predict / metrics  from bakeoff.py
  - label v2 (ttm, thr .10, fwd 12) and features v2 unchanged.
No repo files touched. Writes ext/recall_curve.csv and ext/macro_ablation.csv.
"""
from __future__ import annotations

import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# Study layout was mlbench/ + mlbench/ext/; in the archived repo copy everything
# lives flat in this directory. Resolve paths relative to the file itself.
MLBENCH = os.path.dirname(os.path.abspath(__file__))
HERE = MLBENCH
sys.path.insert(0, MLBENCH)

import bakeoff as B
import features_v2 as F
import label_v2 as L

TRAIN_END_YEARS = B.TRAIN_END_YEARS
BUDGETS = [5, 10, 15, 20, 25, 30, 40]


# --------------------------------------------------------------------------- #
# E1 : exclusion-budget curve
# --------------------------------------------------------------------------- #
def e1_curve(master: pd.DataFrame, model_name: str) -> pd.DataFrame:
    """Per-fold, rank deduped eval set by predicted cut prob; for each budget k%
    exclude the top-k% and record recall / precision / yield opportunity cost."""
    label_col = "label_new"
    feat_cols = F.FEATURE_COLUMNS_V2
    rows = []
    for Y in TRAIN_END_YEARS:
        eval_year = Y + 1
        train_cut = pd.Timestamp(year=Y, month=12, day=31) - pd.DateOffset(months=12)
        tr = master[(master["date"] <= train_cut) & master[label_col].notna()].copy()
        if tr[label_col].nunique() < 2 or tr[label_col].sum() < 3:
            continue
        eval_idx = B.dedup_eval_index(master, label_col, eval_year)
        te = master.loc[eval_idx]
        te = te[te[label_col].notna()]
        if len(te) == 0 or te[label_col].nunique() < 2:
            continue

        Xtr, ytr = tr[feat_cols], tr[label_col].values
        Xte = te[feat_cols]
        yte = te[label_col].values.astype(int)
        yld = te["ttm_yield"].values.astype(float)

        if model_name == "DumbRule":
            s = (-te[F.DUMB_FEATURE].fillna(0.0)).values
        else:
            s = B.fit_predict(model_name, Xtr, ytr, tr["date"], Xte)

        n = len(yte)
        total_pos = int(yte.sum())
        order = np.argsort(-s)  # highest risk first
        for k in BUDGETS:
            n_excl = max(1, int(round(k / 100.0 * n)))
            excl = order[:n_excl]
            ret = order[n_excl:]
            excl_pos = int(yte[excl].sum())
            recall = excl_pos / total_pos if total_pos else np.nan
            precision = excl_pos / n_excl
            y_excl = np.nanmean(yld[excl]) if len(excl) else np.nan
            y_ret = np.nanmean(yld[ret]) if len(ret) else np.nan
            yield_cost = y_excl - y_ret
            rows.append(dict(model=model_name, train_end=Y, eval_year=eval_year,
                             k_pct=k, n_eval=n, n_excluded=n_excl, total_pos=total_pos,
                             excl_pos=excl_pos, recall=recall, precision=precision,
                             yield_excl=y_excl, yield_ret=y_ret, yield_cost=yield_cost))
    return pd.DataFrame(rows)


def e1_aggregate(folds: pd.DataFrame) -> pd.DataFrame:
    g = folds.groupby(["model", "k_pct"])
    agg = g.agg(
        folds=("recall", "size"),
        recall_mean=("recall", "mean"), recall_std=("recall", "std"),
        precision_mean=("precision", "mean"), precision_std=("precision", "std"),
        yield_cost_mean=("yield_cost", "mean"), yield_cost_std=("yield_cost", "std"),
    ).reset_index()
    return agg


# --------------------------------------------------------------------------- #
# E2 : internal macro proxies (cached data only)
# --------------------------------------------------------------------------- #
MACRO_COLS = ["rate_proxy_chg", "credit_spread", "credit_spread_chg", "breadth_stress"]


def build_macro(master: pd.DataFrame) -> pd.DataFrame:
    """Month-level macro proxies from the panel itself (ttm_yield, payout_trend_6, category).

    rate_proxy_chg    : 12m change in median TTM yield of bond-category funds.
    credit_spread     : XHY.TO ttm_yield - XBB.TO ttm_yield (per month).
    credit_spread_chg : 12m change of credit_spread.
    breadth_stress    : fraction of ALL funds whose TTM run-rate fell >=5% over trailing 6m
                        (payout_trend_6 <= -0.05).
    Returns a frame indexed by month `date` with MACRO_COLS.
    """
    p = master[["ticker", "date", "category", "ttm_yield", "payout_trend_6"]].copy()
    p["date"] = pd.to_datetime(p["date"])

    # bond median yield -> 12m change
    bond = p[p["category"] == "bond"]
    bond_med = bond.groupby("date")["ttm_yield"].median().sort_index()
    rate_proxy_chg = bond_med - bond_med.shift(12)

    # credit spread from the two named funds
    def fund_yield(tkr):
        s = p[p["ticker"] == tkr].set_index("date")["ttm_yield"].sort_index()
        return s[~s.index.duplicated()]
    xhy = fund_yield("XHY.TO")
    xbb = fund_yield("XBB.TO")
    all_dates = pd.Index(sorted(p["date"].unique()))
    xhy = xhy.reindex(all_dates)
    xbb = xbb.reindex(all_dates)
    credit_spread = xhy - xbb
    credit_spread_chg = credit_spread - credit_spread.shift(12)

    # market-wide payout stress breadth
    stress = p.assign(stress=(p["payout_trend_6"] <= -0.05).astype(float))
    breadth = stress.groupby("date")["stress"].mean().sort_index()

    macro = pd.DataFrame(index=all_dates)
    macro.index.name = "date"
    macro["rate_proxy_chg"] = rate_proxy_chg.reindex(all_dates)
    macro["credit_spread"] = credit_spread.reindex(all_dates)
    macro["credit_spread_chg"] = credit_spread_chg.reindex(all_dates)
    macro["breadth_stress"] = breadth.reindex(all_dates)
    return macro.reset_index()


def e2_run(master: pd.DataFrame, model_name: str, feat_cols: list, tag: str) -> pd.DataFrame:
    d = B.run_config(master, "label_new", feat_cols, model_name)
    d["model"] = model_name
    d["variant"] = tag
    return d


# --------------------------------------------------------------------------- #
def main():
    print("building master panel ...", flush=True)
    raw = L.load_raw()
    master, _ = B.build_master(raw)
    print(f"master: {len(master)} rows, {master['ticker'].nunique()} funds", flush=True)

    # ---------------- E1 ----------------
    print("\n=== E1: exclusion-budget curve ===", flush=True)
    e1_folds = []
    for mdl in ["CatBoost", "LogReg", "DumbRule"]:
        print(f"  E1 model {mdl} ...", flush=True)
        e1_folds.append(e1_curve(master, mdl))
    e1_folds = pd.concat(e1_folds, ignore_index=True)
    e1_agg = e1_aggregate(e1_folds)
    e1_folds.to_csv(os.path.join(HERE, "recall_curve_folds.csv"), index=False)
    e1_agg.to_csv(os.path.join(HERE, "recall_curve.csv"), index=False)
    print(e1_agg.round(3).to_string(index=False), flush=True)

    # ---------------- E2 ----------------
    print("\n=== E2: macro-proxy ablation ===", flush=True)
    macro = build_macro(master)
    macro.to_csv(os.path.join(HERE, "macro_proxies_monthly.csv"), index=False)
    print("macro proxies (last 6 months):", flush=True)
    print(macro.dropna().tail(6).round(4).to_string(index=False), flush=True)

    m2 = master.merge(macro, on="date", how="left")
    base_cols = F.FEATURE_COLUMNS_V2
    macro_cols = base_cols + MACRO_COLS

    e2_folds = []
    for mdl in ["CatBoost", "LogReg"]:
        print(f"  E2 {mdl} baseline ...", flush=True)
        e2_folds.append(e2_run(m2, mdl, base_cols, "A_baseline"))
        print(f"  E2 {mdl} +macro ...", flush=True)
        e2_folds.append(e2_run(m2, mdl, macro_cols, "B_macro"))
    e2_folds = pd.concat(e2_folds, ignore_index=True)
    e2_folds.to_csv(os.path.join(HERE, "macro_ablation.csv"), index=False)

    # aggregated + delta
    agg = e2_folds.groupby(["model", "variant"]).agg(
        pr_auc_mean=("pr_auc", "mean"), pr_auc_std=("pr_auc", "std"),
        roc_auc_mean=("roc_auc", "mean"), roc_auc_std=("roc_auc", "std"),
        folds=("pr_auc", "size")).reset_index()
    agg.to_csv(os.path.join(HERE, "macro_ablation_agg.csv"), index=False)
    print("\nE2 aggregated:", flush=True)
    print(agg.round(4).to_string(index=False), flush=True)

    # per-fold delta for CatBoost
    print("\nE2 per-fold PR-AUC / ROC-AUC (CatBoost) baseline -> +macro:", flush=True)
    for mdl in ["CatBoost", "LogReg"]:
        a = e2_folds[(e2_folds.model == mdl) & (e2_folds.variant == "A_baseline")].set_index("eval_year")
        b = e2_folds[(e2_folds.model == mdl) & (e2_folds.variant == "B_macro")].set_index("eval_year")
        rows = []
        for yr in sorted(a.index):
            rows.append(dict(model=mdl, eval_year=yr,
                             pr_base=a.loc[yr, "pr_auc"], pr_macro=b.loc[yr, "pr_auc"],
                             pr_delta=b.loc[yr, "pr_auc"] - a.loc[yr, "pr_auc"],
                             roc_base=a.loc[yr, "roc_auc"], roc_macro=b.loc[yr, "roc_auc"],
                             roc_delta=b.loc[yr, "roc_auc"] - a.loc[yr, "roc_auc"]))
        dd = pd.DataFrame(rows)
        print(dd.round(4).to_string(index=False), flush=True)


if __name__ == "__main__":
    main()
