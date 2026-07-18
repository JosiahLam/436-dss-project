"""Turn the trained model into the dated risk snapshot the optimizer consumes.

Each ETF gets a cut probability, bucketed into Safe / Watch / Risky. We also
carry the headline features so the dashboard can explain *why* a fund landed
where it did -- transparency is what makes this decision support rather than a
black box.
"""
from __future__ import annotations

import math

import pandas as pd

from .. import config
from ..features.build_features import FEATURE_COLUMNS


def rank_buckets(probs: list[float], tickers: list[str]) -> list[str]:
    """Assign Safe / Watch / Risky by each fund's percentile rank of predicted
    cut probability across the WHOLE snapshot (highest prob = rank 0):

      * top EXCLUDE_PCT of the ranking -> "Risky" (excluded)
      * next band up to WATCH_PCT      -> "Watch"  (weight-capped)
      * the rest                       -> "Safe"

    Ties break deterministically (prob desc, then ticker asc). Works under any
    monotonic scorer (incl. the RuleScorer fallback). Tiny universes degrade
    gracefully: the Risky band uses ceil, but a fund only lands in it when
    n >= 4 — smaller snapshots are all Safe.
    """
    n = len(probs)
    cats = ["Safe"] * n
    if n < 4:
        return cats

    risky_count = math.ceil(n * config.EXCLUDE_PCT)
    watch_top = math.ceil(n * config.WATCH_PCT)  # exclusive upper rank for Watch

    # rank 0 = highest cut probability; deterministic tie-break on ticker.
    order = sorted(range(n), key=lambda i: (-probs[i], tickers[i]))
    for rank, idx in enumerate(order):
        if rank < risky_count:
            cats[idx] = "Risky"
        elif rank < watch_top:
            cats[idx] = "Watch"
    return cats


def _clean(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def score_rows(bundle: dict, latest: pd.DataFrame) -> list[dict]:
    probs = bundle["primary"].predict_proba(latest[FEATURE_COLUMNS])[:, 1]
    tickers = [str(t) for t in latest.index]
    cats = rank_buckets([float(p) for p in probs], tickers)
    rows = []
    for (ticker, row), prob, cat in zip(latest.iterrows(), probs, cats):
        prob = float(prob)
        ever = row["ever_cut"]
        rows.append({
            "ticker": ticker,
            "prob_cut": prob,
            "risk_category": cat,
            # v2 feature columns mapped onto the stable display / DB fields the
            # dashboard and scores table expect.
            "payout_trend": _clean(row["payout_trend_12"]),   # TTM 12m payout trend
            "payout_stability": _clean(row["payout_cv"]),     # payout volatility (CV)
            "ever_cut": int(ever) if ever is not None and not math.isnan(float(ever)) else 0,
            "price_trend": _clean(row["ret_12"]),             # 12m total return
            "dist_yield": _clean(row["ttm_yield"]),           # trailing-12m yield
        })
    return rows
