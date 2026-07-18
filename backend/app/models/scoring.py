"""Turn the trained model into the dated risk snapshot the optimizer consumes.

Each ETF gets a cut probability, bucketed into Safe / Watch / Risky. We also
attach a per-fund *signal attribution* — the top features pushing that fund's
cut probability up, in plain language — so the drill-down can explain *why* a
fund landed where it did. Transparency is what makes this decision support
rather than a black box.

The attribution uses CatBoost's native SHAP values (see classifier.catboost_shap
— no external `shap` dependency). Under the rule-based fallback (degenerate
data) we emit a single honest line instead of SHAP drivers.
"""
from __future__ import annotations

import math

import pandas as pd

from .. import config
from ..features.build_features import FEATURE_COLUMNS
from . import classifier

# Only surface a driver whose SHAP contribution is at least this large (log-odds).
_SHAP_EPS = 1e-3


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


# --------------------------------------------------------------------------- #
# Plain-language signal attribution
# --------------------------------------------------------------------------- #
# Group correlated features into "themes" so we don't show two near-identical
# sentences (e.g. ttm_yield and yield_z_36). We keep the highest-SHAP driver per
# theme, then take the top 3 themes.
_THEME = {
    "ttm_yield": "yield", "yield_z_36": "yield", "yield_vs_cat": "yield",
    "payout_trend_6": "payout_trend", "payout_trend_12": "payout_trend",
    "payout_trend_24": "payout_trend",
    "rr_drawdown_24": "payout_level", "rr_decline_months": "payout_level",
    "payout_cv": "payout_vol",
    "ret_6": "price_ret", "ret_12": "price_ret", "ret_vol_12": "price_vol",
    "price_drawdown_24": "price_drawdown",
    "ever_cut": "prior_cut", "months_since_cut": "prior_cut",
    "age_log": "age",
    "cat_covered_call": "category", "cat_equity_income": "category",
    "cat_bond": "category", "cat_reit": "category",
}

_CATEGORY_TEXT = {
    "cat_covered_call": "Covered-call funds carry structurally higher cut risk.",
    "cat_reit": "REIT distributions are rate-sensitive, raising cut risk.",
    "cat_equity_income": "Equity-income funds carry moderate distribution risk.",
    "cat_bond": "Bond-fund distributions move with interest rates.",
}


def _phrase(feature: str, value: float | None) -> str | None:
    """Turn one (feature, value) contributor into a plain-language sentence.

    Returns None if the value is missing or the feature can't be phrased
    meaningfully (e.g. a category one-hot that isn't this fund's category).
    """
    v = _clean(value)

    if feature in _CATEGORY_TEXT:
        # Only meaningful when it's actually this fund's category (one-hot = 1).
        return _CATEGORY_TEXT[feature] if v and v >= 0.5 else None

    if v is None:
        return None

    if feature == "ttm_yield":
        return f"Trailing yield is {v * 100:.1f}% — a high yield often prices in distribution risk."
    if feature == "yield_z_36":
        return f"Yield is {v:.1f}σ above this fund's own 3-year norm — the market may be pricing distribution risk."
    if feature == "yield_vs_cat":
        return f"Yield sits {v * 100:.0f}% above its category median — an outlier the market may distrust."
    if feature == "payout_trend_6":
        return f"Trailing-12-month payout is {'down' if v < 0 else 'up'} {abs(v) * 100:.0f}% over the last 6 months."
    if feature == "payout_trend_12":
        return f"Trailing-12-month payout is {'down' if v < 0 else 'up'} {abs(v) * 100:.0f}% year-over-year."
    if feature == "payout_trend_24":
        return f"Trailing-12-month payout is {'down' if v < 0 else 'up'} {abs(v) * 100:.0f}% over 2 years."
    if feature == "rr_drawdown_24":
        return f"Payout run-rate is {abs(v) * 100:.0f}% below its 2-year peak."
    if feature == "rr_decline_months":
        n = int(round(v))
        return f"Payout has declined for {n} straight month{'s' if n != 1 else ''}."
    if feature == "payout_cv":
        return f"Payout has been unusually volatile (coefficient of variation {v:.1f})."
    if feature == "ret_6":
        return f"Price return is {v * 100:+.0f}% over the past 6 months."
    if feature == "ret_12":
        return f"Price return is {v * 100:+.0f}% over the past year."
    if feature == "ret_vol_12":
        return f"Price has been volatile lately (12-month volatility {v * 100:.0f}%)."
    if feature == "price_drawdown_24":
        return f"Price is {abs(v) * 100:.0f}% below its 2-year high."
    if feature == "ever_cut":
        return "This fund has cut its distribution before." if v >= 0.5 else None
    if feature == "months_since_cut":
        n = int(round(v))
        return f"Cut its distribution before — {n} month{'s' if n != 1 else ''} ago."
    if feature == "age_log":
        return "Relatively short operating history to judge distribution durability."
    return None


def _explanation_for(shap_row, feature_row: pd.Series, rank: int, n: int) -> dict:
    """Top-3 upward drivers (deduped by theme) + rank context for one fund."""
    drivers: list[dict] = []
    if shap_row is not None:
        contribs = sorted(
            (
                {"feature": f, "shap": float(s), "value": _clean(feature_row[f])}
                for f, s in zip(FEATURE_COLUMNS, shap_row)
                if float(s) > _SHAP_EPS
            ),
            key=lambda d: d["shap"],
            reverse=True,
        )
        seen_themes: set[str] = set()
        for c in contribs:
            theme = _THEME.get(c["feature"], c["feature"])
            if theme in seen_themes:
                continue
            text = _phrase(c["feature"], c["value"])
            if not text:
                continue
            seen_themes.add(theme)
            drivers.append({"text": text, "feature": c["feature"], "shap": round(c["shap"], 4)})
            if len(drivers) == 3:
                break

    return {
        "drivers": drivers,
        "rank": rank,                       # 1 = highest cut risk
        "n": n,
        "pct": round(rank / n, 4) if n else None,   # percentile from the top
    }


def _fallback_explanation(rank: int, n: int) -> dict:
    return {
        "drivers": [{
            "text": "Rule-based fallback: score reflects the payout downtrend (insufficient data to train the model).",
            "feature": None, "shap": None,
        }],
        "rank": rank, "n": n,
        "pct": round(rank / n, 4) if n else None,
    }


def score_rows(bundle: dict, latest: pd.DataFrame) -> list[dict]:
    X = latest[FEATURE_COLUMNS]
    probs = bundle["primary"].predict_proba(X)[:, 1]
    tickers = [str(t) for t in latest.index]
    cats = rank_buckets([float(p) for p in probs], tickers)

    n = len(tickers)
    # 1-based rank by cut probability (highest = rank 1), deterministic ties.
    order = sorted(range(n), key=lambda i: (-float(probs[i]), tickers[i]))
    rank_of = {idx: r + 1 for r, idx in enumerate(order)}

    is_fallback = bool(bundle.get("fallback"))
    shap = None if is_fallback else classifier.catboost_shap(bundle["primary"], X)

    rows = []
    for i, ((ticker, row), prob, cat) in enumerate(zip(latest.iterrows(), probs, cats)):
        prob = float(prob)
        ever = row["ever_cut"]
        rank = rank_of[i]
        if shap is not None:
            explain = _explanation_for(shap[i], row, rank, n)
        else:
            explain = _fallback_explanation(rank, n)
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
            "explain": explain,
        })
    return rows
