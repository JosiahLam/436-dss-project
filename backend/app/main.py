"""Perch DSS — FastAPI surface.

Read endpoints serve the stored monthly snapshot to the dashboard; the /plans
endpoint runs the optimizer in real time; /refresh re-runs the batch pipeline.
"""
from __future__ import annotations

import math

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .features import labels
from .optimize import portfolio
from .storage import cache, db

# NOTE: `run_pipeline` (and its scikit-learn / yfinance imports) is imported
# lazily inside the functions below, so serving cold starts stay fast.

app = FastAPI(title="Perch DSS API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"service": "Perch DSS API", "docs": "/docs", "health": "/api/health"}


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    # Self-seed on a fresh host (e.g. Render) so the API has data to serve.
    # Normally the snapshot is baked at build time, so this is just a safety net.
    if db.latest_run_date() is None:
        try:
            from .pipeline import run_pipeline
            run_pipeline(force_synthetic=True)
        except Exception as exc:  # pragma: no cover - best-effort seed
            print(f"[startup] seed pipeline failed: {exc}")


def _f(v):
    """JSON-safe float (None for NaN)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else round(f, 6)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "has_data": db.latest_run_date() is not None}


@app.get("/api/run-info")
def run_info() -> dict:
    info = db.latest_run_info()
    if not info:
        return {"has_data": False}
    return {"has_data": True, **info}


@app.get("/api/universe")
def universe() -> dict:
    scores = db.latest_scores()
    info = db.latest_run_info() or {}
    etfs = []
    for r in scores:
        etfs.append({
            "ticker": r["ticker"],
            "name": r["name"],
            "category": r["category"],
            "category_label": config.CATEGORY_LABELS.get(r["category"], ""),
            "provider": r["provider"],
            "risk_category": r["risk_category"],
            "prob_cut": _f(r["prob_cut"]),
            "dist_yield": _f(r["dist_yield"]),
            "payout_trend": _f(r["payout_trend"]),
            "payout_stability": _f(r["payout_stability"]),
            "price_trend": _f(r["price_trend"]),
            "ever_cut": int(r["ever_cut"]) if r["ever_cut"] is not None else 0,
            "last_price": _f(r["last_price"]),
            "expense_ratio": _f(r["expense_ratio"]),
            "age_months": r["age_months"],
            "eligible": bool(r["eligible"]),
            "screen_reason": r["screen_reason"],
        })
    return {
        "as_of": info.get("run_date"),
        "data_source": info.get("data_source"),
        "etfs": etfs,
    }


@app.get("/api/etf/{ticker}")
def etf_detail(ticker: str) -> dict:
    ticker = ticker.upper()
    scores = {r["ticker"]: r for r in db.latest_scores()}
    if ticker not in scores:
        raise HTTPException(404, f"{ticker} not found in latest snapshot")

    prices = cache.read_prices(ticker)
    divs = cache.read_dividends(ticker)
    history = []
    if prices is not None:
        rr = labels.run_rate(divs) if divs is not None else None
        tail = prices.iloc[-72:]
        for ts, px in tail.items():
            d = pd.Timestamp(ts)
            history.append({
                "date": d.strftime("%Y-%m"),
                "price": _f(px),
                "dividend": _f(divs.get(ts)) if divs is not None else None,
                "run_rate": _f(rr.get(ts)) if rr is not None else None,
            })

    r = scores[ticker]
    return {
        "ticker": ticker,
        "name": r["name"],
        "category_label": config.CATEGORY_LABELS.get(r["category"], ""),
        "provider": r["provider"],
        "risk_category": r["risk_category"],
        "prob_cut": _f(r["prob_cut"]),
        "dist_yield": _f(r["dist_yield"]),
        "payout_trend": _f(r["payout_trend"]),
        "payout_stability": _f(r["payout_stability"]),
        "price_trend": _f(r["price_trend"]),
        "ever_cut": int(r["ever_cut"]) if r["ever_cut"] is not None else 0,
        "eligible": bool(r["eligible"]),
        "screen_reason": r["screen_reason"],
        "history": history,
    }


class PlanRequest(BaseModel):
    budget: float = Field(50000, gt=0)
    include: list[str] = []
    exclude: list[str] = []
    horizon_months: int = 12
    max_weight: float | None = Field(None, gt=0, le=1)
    # Per-category weight caps, e.g. {"covered_call": 0.2}. Keys: covered_call,
    # equity_income, bond, reit.
    category_caps: dict[str, float] | None = None


@app.post("/api/plans")
def plans(req: PlanRequest) -> dict:
    try:
        return portfolio.build_plans(
            budget=req.budget, include=req.include, exclude=req.exclude,
            horizon_months=req.horizon_months, max_weight=req.max_weight,
            category_caps=req.category_caps,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/refresh")
def refresh(synthetic: bool = False) -> dict:
    from .pipeline import run_pipeline  # lazy: keeps sklearn/yfinance off the cold path
    return run_pipeline(force_synthetic=synthetic)
