"""Module 2 -- the dividend-cut classifier.

Locked model decision (ML redesign v2):
  * primary  -- CatBoostClassifier (auto_class_weights="Balanced", shallow trees,
                modest iterations). Handles NaN features natively, and was the
                walk-forward bake-off winner on ROC-AUC and cut-avoidance.
  * baseline -- LogisticRegression (median-imputed, scaled, balanced). Kept for
                the comparison metrics and as an interpretable sanity check.
  * fallback -- RuleScorer, used only when the labelled data is single-class
                (can happen on tiny / synthetic universes) so the pipeline never
                crashes and still emits sensible risk scores.

Evaluation is an *honest* walk-forward, episode-deduplicated protocol (ported
from the study's bakeoff.py):

  For each train_end year Y in config.WALKFORWARD_YEARS:
    * TRAIN on labelled rows whose forward label window closes on/before end of
      year Y (a full-year embargo prevents the 12m label horizon leaking).
    * EVALUATE on year Y+1, episode-deduplicated: positives = each cut episode's
      ONSET month only; negatives = stride-6 (non-overlapping) negative rows.

Headline DECISION metrics (target avoidance = config.TARGET_AVOIDANCE):
  * cut_avoidance       -- fraction of cut episodes caught at the operating
                           exclusion budget (config.EXCLUSION_BUDGET), CatBoost.
  * exclusion_budget    -- budget needed to reach TARGET_AVOIDANCE, CatBoost.
  * lr_exclusion_budget -- budget needed to reach TARGET_AVOIDANCE, LogReg.
  * n_events            -- number of independent positive cut events evaluated.
  * folds               -- number of walk-forward folds that ran.
Secondary: mean ROC-AUC / PR-AUC (± std) for both models.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .. import config
from ..features.build_features import FEATURE_COLUMNS

RANDOM_STATE = 0

# Fine budget grid (percent of the ranked universe excluded) used to solve for
# the exclusion budget that achieves the target cut-avoidance level.
_BUDGET_GRID = np.arange(1, 61)


class RuleScorer:
    """Fallback: squashes the (negated) payout trend into a pseudo-probability.

    A steeply falling TTM payout -> high cut probability. Used only when there is
    not enough labelled (or two-class) data to fit a real model.
    """

    def fit(self, X, y=None):
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        trend = X["payout_trend_12"].fillna(0.0).to_numpy()
        ever = X["ever_cut"].fillna(0.0).to_numpy()
        z = -4.0 * trend + 0.6 * ever - 0.4
        p = 1.0 / (1.0 + np.exp(-z))
        return np.column_stack([1.0 - p, p])


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
def _make_catboost(early_stopping: bool = False):
    from catboost import CatBoostClassifier

    return CatBoostClassifier(
        iterations=600, learning_rate=0.05, depth=5, l2_leaf_reg=3.0,
        auto_class_weights="Balanced", random_state=RANDOM_STATE, verbose=0,
        allow_writing_files=False,
        early_stopping_rounds=50 if early_stopping else None,
    )


def _make_logreg():
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(class_weight="balanced", max_iter=2000)),
    ])


def _inner_temporal_val(dates: pd.Series, frac: float = 0.15) -> np.ndarray:
    """Boolean mask for the last `frac` of training rows by date (early stopping)."""
    d = pd.to_datetime(dates)
    cut = d.quantile(1 - frac)
    return (d > cut).values


def _fit_predict(name: str, Xtr: pd.DataFrame, ytr: np.ndarray,
                 dates_tr: pd.Series, Xte: pd.DataFrame) -> np.ndarray:
    ytr = np.asarray(ytr).astype(int)
    if name == "LogReg":
        return _make_logreg().fit(Xtr, ytr).predict_proba(Xte)[:, 1]

    # CatBoost with inner temporal early stopping.
    vmask = _inner_temporal_val(dates_tr)
    use_es = vmask.sum() >= 5 and ytr[vmask].sum() >= 1 and ytr[~vmask].sum() >= 1
    m = _make_catboost(early_stopping=use_es)
    if use_es:
        m.fit(Xtr[~vmask], ytr[~vmask], eval_set=(Xtr[vmask], ytr[vmask]))
    else:
        m.fit(Xtr, ytr)
    return m.predict_proba(Xte)[:, 1]


# --------------------------------------------------------------------------- #
# Episode-deduplicated evaluation set
# --------------------------------------------------------------------------- #
def _dedup_eval_index(panel: pd.DataFrame, eval_year: int) -> list:
    """Row-indices for the deduped eval set within `eval_year`:
    episode-onset positives + stride-6 negatives, onset computed over the full
    per-ticker series."""
    keep = []
    for _, g in panel.groupby("ticker"):
        g = g.sort_values("date")
        lab = g["label"].values
        yr = g["date"].dt.year.values
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


def _recall_at_budgets(scores: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Recall (cut-avoidance) when excluding the top-k% by score, for each k in
    _BUDGET_GRID. Returns an array aligned to _BUDGET_GRID (NaN if no positives)."""
    n = len(y)
    total_pos = int(y.sum())
    order = np.argsort(-scores)
    out = np.full(len(_BUDGET_GRID), np.nan)
    if total_pos == 0:
        return out
    for j, k in enumerate(_BUDGET_GRID):
        n_excl = max(1, int(round(k / 100.0 * n)))
        excl = order[:n_excl]
        out[j] = int(y[excl].sum()) / total_pos
    return out


def _budget_for_target(mean_recall: np.ndarray, target: float) -> float | None:
    """Smallest exclusion budget (as a fraction) whose mean recall reaches
    `target`, linearly interpolated between grid points. None if never reached."""
    valid = ~np.isnan(mean_recall)
    if not valid.any():
        return None
    grid = _BUDGET_GRID[valid]
    rec = mean_recall[valid]
    hit = np.where(rec >= target)[0]
    if len(hit) == 0:
        return None
    i = hit[0]
    if i == 0:
        return float(grid[0]) / 100.0
    r0, r1 = rec[i - 1], rec[i]
    g0, g1 = grid[i - 1], grid[i]
    frac = 0.0 if r1 == r0 else (target - r0) / (r1 - r0)
    return float(g0 + frac * (g1 - g0)) / 100.0


# --------------------------------------------------------------------------- #
# Walk-forward evaluation -> decision metrics
# --------------------------------------------------------------------------- #
def _empty_metrics() -> dict:
    return {
        "cut_avoidance": None,
        "exclusion_budget": None,
        "lr_exclusion_budget": None,
        "n_events": 0,
        "folds": 0,
        "model_roc": None, "model_roc_std": None, "model_pr": None,
        "baseline_roc": None, "baseline_pr": None,
        "target_avoidance": config.TARGET_AVOIDANCE,
    }


def evaluate(panel: pd.DataFrame) -> dict:
    """Walk-forward, episode-deduplicated evaluation producing the decision
    metrics. Degrades gracefully (all-None metrics) on thin / single-class data."""
    metrics = _empty_metrics()
    if panel is None or panel.empty or "label" not in panel:
        return metrics

    panel = panel.copy()
    panel["date"] = pd.to_datetime(panel["date"])

    cb_roc, cb_pr = [], []
    lr_roc, lr_pr = [], []
    cb_recall_grid, lr_recall_grid = [], []
    n_events = 0
    folds = 0

    for Y in config.WALKFORWARD_YEARS:
        eval_year = Y + 1
        train_cut = pd.Timestamp(year=Y, month=12, day=31) - pd.DateOffset(months=12)

        tr = panel[(panel["date"] <= train_cut) & panel["label"].notna()]
        if tr["label"].nunique() < 2 or tr["label"].sum() < 3:
            continue

        eval_idx = _dedup_eval_index(panel, eval_year)
        te = panel.loc[eval_idx]
        te = te[te["label"].notna()]
        if len(te) == 0 or te["label"].nunique() < 2:
            continue

        Xtr, ytr = tr[FEATURE_COLUMNS], tr["label"].astype(int).values
        Xte, yte = te[FEATURE_COLUMNS], te["label"].astype(int).values

        try:
            s_cb = _fit_predict("CatBoost", Xtr, ytr, tr["date"], Xte)
            s_lr = _fit_predict("LogReg", Xtr, ytr, tr["date"], Xte)
        except Exception:
            continue

        folds += 1
        n_events += int(yte.sum())

        if yte.sum() not in (0, len(yte)):
            cb_roc.append(roc_auc_score(yte, s_cb))
            cb_pr.append(average_precision_score(yte, s_cb))
            lr_roc.append(roc_auc_score(yte, s_lr))
            lr_pr.append(average_precision_score(yte, s_lr))
        cb_recall_grid.append(_recall_at_budgets(s_cb, yte))
        lr_recall_grid.append(_recall_at_budgets(s_lr, yte))

    if folds == 0:
        return metrics

    metrics["folds"] = folds
    metrics["n_events"] = int(n_events)

    def _mean_std(vals):
        if not vals:
            return None, None
        a = np.asarray(vals, dtype=float)
        return float(np.nanmean(a)), (float(np.nanstd(a, ddof=1)) if len(a) > 1 else 0.0)

    metrics["model_roc"], metrics["model_roc_std"] = _mean_std(cb_roc)
    metrics["model_pr"], _ = _mean_std(cb_pr)
    metrics["baseline_roc"], _ = _mean_std(lr_roc)
    metrics["baseline_pr"], _ = _mean_std(lr_pr)

    if cb_recall_grid:
        cb_mean = np.nanmean(np.vstack(cb_recall_grid), axis=0)
        k_idx = int(np.argmin(np.abs(_BUDGET_GRID - config.EXCLUSION_BUDGET * 100)))
        val = cb_mean[k_idx]
        metrics["cut_avoidance"] = None if np.isnan(val) else float(val)
        metrics["exclusion_budget"] = _budget_for_target(cb_mean, config.TARGET_AVOIDANCE)
    if lr_recall_grid:
        lr_mean = np.nanmean(np.vstack(lr_recall_grid), axis=0)
        metrics["lr_exclusion_budget"] = _budget_for_target(lr_mean, config.TARGET_AVOIDANCE)

    return metrics


# --------------------------------------------------------------------------- #
# Train
# --------------------------------------------------------------------------- #
def train(X: pd.DataFrame, y: pd.Series, dates: pd.DatetimeIndex,
          panel: pd.DataFrame | None = None) -> dict:
    """Fit the primary + baseline models and compute walk-forward decision
    metrics. Returns a bundle {primary, baseline, metrics, fallback}."""
    # Single-class labelled data -> transparent rule-based fallback.
    if y is None or len(y) == 0 or pd.Series(y).nunique() < 2:
        scorer = RuleScorer().fit(X, y)
        m = _empty_metrics()
        return {"primary": scorer, "baseline": scorer, "metrics": m, "fallback": True}

    metrics = evaluate(panel) if panel is not None else _empty_metrics()

    # Final fit on ALL labelled data -> used for live scoring.
    try:
        primary = _make_catboost(early_stopping=False)
        primary.fit(X, y)
        baseline = _make_logreg().fit(X, y)
        fallback = False
    except Exception:
        # If CatBoost is unavailable / fails, degrade to the rule scorer for
        # scoring but keep whatever metrics we computed.
        scorer = RuleScorer().fit(X, y)
        primary = baseline = scorer
        fallback = True

    return {"primary": primary, "baseline": baseline, "metrics": metrics,
            "fallback": fallback}
