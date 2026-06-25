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


def bucket(prob: float) -> str:
    if prob < config.SAFE_MAX:
        return "Safe"
    if prob >= config.RISKY_MIN:
        return "Risky"
    return "Watch"


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
    rows = []
    for (ticker, row), prob in zip(latest.iterrows(), probs):
        prob = float(prob)
        rows.append({
            "ticker": ticker,
            "prob_cut": prob,
            "risk_category": bucket(prob),
            "payout_trend": _clean(row["payout_trend"]),
            "payout_stability": _clean(row["payout_stability"]),
            "ever_cut": int(row["ever_cut"]) if not math.isnan(row["ever_cut"]) else 0,
            "price_trend": _clean(row["price_trend"]),
            "dist_yield": _clean(row["dist_yield"]),
        })
    return rows
