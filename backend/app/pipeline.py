"""Pipeline orchestration -- the monthly batch job.

ingest -> screen -> engineer features + labels -> train classifier -> score the
universe -> persist a dated snapshot. The real-time optimizer later reads only
the stored snapshot, exactly as the proposal describes.
"""
from __future__ import annotations

import datetime
from collections import Counter

from . import config
from .data import ingest
from .features import build_features
from .models import classifier, scoring
from .storage import cache, db


def _screen(ticker: str, age_months: int) -> tuple[bool, str]:
    """Module 1 screen: drop leveraged or too-new funds."""
    if ticker in config.LEVERAGED_TICKERS:
        return False, "leveraged"
    if age_months < config.MIN_AGE_MONTHS:
        return False, f"too new ({age_months}m history)"
    return True, "eligible"


def run_pipeline(force_synthetic: bool = False) -> dict:
    db.init_db()

    ing = ingest.ingest_universe(force_synthetic=force_synthetic)
    attrs_all, data_source = ing["attrs"], ing["data_source"]

    data: dict[str, dict] = {}
    for ticker in config.TICKERS:
        prices = cache.read_prices(ticker)
        if prices is None or prices.empty:
            continue
        divs = cache.read_dividends(ticker)
        data[ticker] = {
            "prices": prices,
            "dividends": divs if divs is not None else prices * 0.0,
            "attrs": attrs_all.get(ticker, {"last_price": float(prices.iloc[-1]),
                                            "age_months": len(prices),
                                            "expense_ratio": None}),
        }

    # Screening (Module 1)
    screen, eligible = {}, []
    for ticker, d in data.items():
        age = d["attrs"].get("age_months") or len(d["prices"])
        ok, reason = _screen(ticker, age)
        screen[ticker] = (ok, reason)
        if ok:
            eligible.append(ticker)

    # Train on the eligible shortlist (fall back to everything if too few).
    train_data = {t: data[t] for t in eligible} or data
    X, y, dates = build_features.build_training_panel(train_data)
    bundle = classifier.train(X, y, dates)

    # Score every ETF that has features (optimizer ignores ineligible ones).
    latest = build_features.latest_features(data)
    rows = scoring.score_rows(bundle, latest)
    score_by = {r["ticker"]: r for r in rows}

    # Persist
    run_date = datetime.date.today().isoformat()
    universe_rows = []
    for ticker in config.TICKERS:
        if ticker not in data:
            continue
        sc = score_by.get(ticker, {})
        ok, reason = screen.get(ticker, (False, "no data"))
        universe_rows.append({
            "ticker": ticker,
            "name": config.META[ticker]["name"],
            "category": config.META[ticker]["category"],
            "provider": config.META[ticker]["provider"],
            "expense_ratio": data[ticker]["attrs"].get("expense_ratio"),
            "age_months": data[ticker]["attrs"].get("age_months"),
            "last_price": data[ticker]["attrs"].get("last_price"),
            "dist_yield": sc.get("dist_yield"),
            "eligible": 1 if ok else 0,
            "screen_reason": reason,
        })

    db.upsert_universe(universe_rows)
    db.write_scores(run_date, rows)

    m = bundle["metrics"]
    db.write_run({
        "run_date": run_date,
        "n_etfs": len(data),
        "n_eligible": len(eligible),
        "model_auc": m["model_auc"],
        "baseline_auc": m["baseline_auc"],
        "rule_auc": m["rule_auc"],
        "risky_precision": m["risky_precision"],
        "data_source": data_source,
        "notes": "rule-based fallback scorer" if bundle.get("fallback") else "",
    })

    return {
        "run_date": run_date,
        "data_source": data_source,
        "n_etfs": len(data),
        "n_eligible": len(eligible),
        "n_train_rows": int(len(y)),
        "n_positive_labels": int(y.sum()) if len(y) else 0,
        "buckets": dict(Counter(r["risk_category"] for r in rows)),
        "metrics": m,
        "fallback": bool(bundle.get("fallback")),
    }
