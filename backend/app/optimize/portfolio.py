"""Module 3 -- mean-variance portfolio optimization.

Maximize expected monthly income (return = distribution yield) subject to a
volatility budget, using a covariance matrix of monthly price returns. The ML
risk score feeds in two ways:
  * Risky ETFs are dropped from the candidate set.
  * Watch ETFs get a hard per-name weight cap.
  * The "income resilience" rule requires >= SAFE_INCOME_FLOOR of expected
    income to come from Safe assets (relaxed for the High-risk plan).

We trace the efficient frontier across several volatility levels, then surface
three points -- Safe (min variance), Balanced (mid), High-risk (max income).
Weights are converted to whole-share lots at current prices, with leftover cash
reported honestly.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from .. import config
from ..storage import cache, db


def _returns_frame(tickers: list[str]):
    cols, series = [], {}
    for t in tickers:
        p = cache.read_prices(t)
        if p is not None and len(p) > 13:
            series[t] = p.pct_change()
            cols.append(t)
    import pandas as pd
    df = pd.DataFrame(series).dropna(how="any")
    if len(df) > config.COV_LOOKBACK_MONTHS:
        df = df.iloc[-config.COV_LOOKBACK_MONTHS:]
    return [t for t in tickers if t in df.columns], df


class _Problem:
    """Holds the matrices for one optimization request."""

    def __init__(self, tickers, mu, cov, price, safe_mask, caps,
                 categories=None, category_caps=None):
        self.tickers = tickers
        self.mu = mu
        self.cov = cov
        self.price = price
        self.safe_mask = safe_mask
        self.caps = caps
        self.n = len(tickers)
        self.categories = categories or [None] * len(tickers)
        # Precompute a per-category boolean mask for each requested cap.
        self.cat_masks = []
        for cat, cap in (category_caps or {}).items():
            mask = np.array([c == cat for c in self.categories], dtype=float)
            if mask.sum() > 0 and cap is not None:
                self.cat_masks.append((mask, float(cap)))

    def vol(self, w: np.ndarray) -> float:
        return float(np.sqrt(max(w @ self.cov @ w, 0.0)))

    def _constraints(self, target_vol, safe_floor):
        cons = [{"type": "eq", "fun": lambda w: w.sum() - 1.0}]
        if target_vol is not None:
            cons.append({"type": "ineq",
                         "fun": lambda w, tv=target_vol: tv - self.vol(w)})
        if safe_floor > 0 and self.safe_mask.sum() > 0:
            # (income from safe) - floor * (total income) >= 0  -- linear in w
            cons.append({"type": "ineq",
                         "fun": lambda w, sf=safe_floor:
                         float((w * self.mu * self.safe_mask).sum()
                               - sf * (w * self.mu).sum())})
        for mask, cap in self.cat_masks:       # weight in a category <= cap
            cons.append({"type": "ineq",
                         "fun": lambda w, m=mask, c=cap: float(c - (w * m).sum())})
        return cons

    def _solve(self, objective, target_vol, safe_floor):
        bounds = [(0.0, float(c)) for c in self.caps]
        w0 = np.clip(np.ones(self.n) / self.n, 0.0, self.caps)
        if w0.sum() <= 0:
            return None
        w0 = w0 / w0.sum()
        res = minimize(objective, w0, method="SLSQP", bounds=bounds,
                       constraints=self._constraints(target_vol, safe_floor),
                       options={"maxiter": 400, "ftol": 1e-9})
        if not res.success or res.x is None:
            return None
        w = np.clip(res.x, 0.0, None)
        return w / w.sum() if w.sum() > 1e-9 else None

    def max_income(self, target_vol, safe_floor):
        return self._solve(lambda w: -(w @ self.mu), target_vol, safe_floor)

    def min_variance(self, safe_floor):
        return self._solve(lambda w: float(w @ self.cov @ w), None, safe_floor)


def _candidates(scores: dict, include: set, exclude: set) -> list[str]:
    cand = []
    for t, r in scores.items():
        if t in exclude:
            continue
        forced = t in include
        if not r["eligible"] and not forced:
            continue
        if r["risk_category"] == "Risky" and not forced:
            continue
        cand.append(t)
    for t in include:                      # forced includes that exist
        if t in scores and t not in cand and t not in exclude:
            cand.append(t)
    return cand


def _with_fallback(fn, floors):
    """Try a solve across progressively relaxed safe floors."""
    for floor in floors:
        w = fn(floor)
        if w is not None:
            return w, floor
    return None, 0.0


def build_plans(budget: float, include=None, exclude=None, horizon_months: int = 12,
                max_weight: float | None = None, category_caps: dict | None = None) -> dict:
    include = {t.upper() for t in (include or [])}
    exclude = {t.upper() for t in (exclude or [])}
    scores = {r["ticker"]: r for r in db.latest_scores()}
    if not scores:
        raise ValueError("No model scores available yet -- run the pipeline first.")

    # normalize include/exclude to actual ticker casing
    canon = {t.upper(): t for t in scores}
    include = {canon[t] for t in include if t in canon}
    exclude = {canon[t] for t in exclude if t in canon}

    dropped_risky = [t for t, r in scores.items()
                     if r["risk_category"] == "Risky" and t not in include]

    cand = _candidates(scores, include, exclude)
    tickers, _ = _returns_frame(cand)
    if len(tickers) < 2:
        raise ValueError("Not enough eligible ETFs with price history to optimize.")

    _, rets = _returns_frame(tickers)
    cov = rets[tickers].cov().to_numpy() * 12.0
    mu = np.array([scores[t]["dist_yield"] or 0.0 for t in tickers])
    price = np.array([scores[t]["last_price"] or np.nan for t in tickers])
    risk = [scores[t]["risk_category"] for t in tickers]
    categories = [scores[t]["category"] for t in tickers]
    safe_mask = np.array([rk == "Safe" for rk in risk], dtype=float)

    # Per-ETF weight cap: user max (default config) for normal funds, never above
    # WATCH_CAP for Watch funds. Forced includes get the user max regardless.
    user_max = float(max_weight) if max_weight else config.MAX_WEIGHT_PER_ETF
    caps = np.array([
        user_max if (t in include or risk[i] != "Watch") else min(config.WATCH_CAP, user_max)
        for i, t in enumerate(tickers)
    ])
    if caps.sum() < 1.0:                    # ensure the budget can be fully allocated
        caps = np.maximum(caps, 1.0 / len(tickers) + 1e-6)

    prob = _Problem(tickers, mu, cov, price, safe_mask, caps,
                    categories=categories, category_caps=category_caps)

    safe_floors = [config.SAFE_INCOME_FLOOR, 0.6, 0.4, 0.0]
    highrisk_floors = [config.HIGHRISK_SAFE_FLOOR, 0.3, 0.0]

    w_min, _ = _with_fallback(prob.min_variance, safe_floors)
    w_full, _ = _with_fallback(lambda f: prob.max_income(None, f), highrisk_floors)
    if w_min is None or w_full is None:
        raise ValueError("Optimizer could not find a feasible portfolio. Try loosening the caps.")
    v_min, v_full = prob.vol(w_min), prob.vol(w_full)
    if v_full < v_min:
        v_full = v_min

    # Time horizon scales how much volatility any plan may take on: a short
    # horizon caps the aggressive end of the frontier, a 12m+ horizon uses it all.
    agg = float(np.clip(horizon_months / 12.0, 0.4, 1.0))
    v_top = v_min + (v_full - v_min) * agg

    # Efficient frontier (proposal: sweep many risk levels, then pick a few).
    frontier = []
    for tv in np.linspace(v_min, v_top, config.N_RISK_LEVELS):
        w, _ = _with_fallback(lambda f, tv=tv: prob.max_income(tv, f), safe_floors)
        if w is not None:
            frontier.append({"volatility": round(prob.vol(w), 4),
                             "monthly_income": round(float(w @ mu) * budget / 12.0, 2)})

    # High-risk targets the (horizon-capped) top of the frontier; Balanced the midpoint.
    w_max, _ = _with_fallback(lambda f: prob.max_income(v_top, f), highrisk_floors)
    if w_max is None:
        w_max = w_full
    v_mid = (v_min + v_top) / 2.0
    w_bal, _ = _with_fallback(lambda f: prob.max_income(v_mid, f), safe_floors)
    if w_bal is None:
        w_bal = w_min

    def to_plan(name: str, blurb: str, w: np.ndarray) -> dict:
        alloc = w * budget
        shares = np.floor(np.divide(alloc, price, out=np.zeros_like(alloc),
                                    where=price > 0)).astype(int)
        cost = shares * price
        monthly = shares * price * mu / 12.0
        invested = float(cost.sum())
        total_monthly = float(monthly.sum())
        holdings = []
        for i, t in enumerate(tickers):
            if shares[i] <= 0:
                continue
            holdings.append({
                "ticker": t,
                "name": scores[t]["name"],
                "category": scores[t]["category"],
                "category_label": config.CATEGORY_LABELS.get(scores[t]["category"], ""),
                "risk": risk[i],
                "shares": int(shares[i]),
                "price": round(float(price[i]), 2),
                "allocation": round(float(cost[i]), 2),
                "weight": round(float(cost[i] / invested) if invested else 0.0, 4),
                "annual_yield": round(float(mu[i]), 4),
                "monthly_income": round(float(monthly[i]), 2),
            })
        holdings.sort(key=lambda h: h["allocation"], reverse=True)
        safe_monthly = float((monthly * safe_mask).sum())
        return {
            "name": name,
            "blurb": blurb,
            "n_holdings": len(holdings),
            "holdings": holdings,
            "invested": round(invested, 2),
            "leftover_cash": round(float(budget) - invested, 2),
            "monthly_income": round(total_monthly, 2),
            "annual_income": round(total_monthly * 12.0, 2),
            "portfolio_yield": round(total_monthly * 12.0 / invested, 4) if invested else 0.0,
            "expected_volatility": round(prob.vol(w), 4),
            "income_secured_pct": round(safe_monthly / total_monthly, 4) if total_monthly else 0.0,
        }

    plans = [
        to_plan("Safe", "Lowest volatility; income anchored in dividend-resilient funds.", w_min),
        to_plan("Balanced", "A middle ground between income and stability.", w_bal),
        to_plan("High-risk", "Chases the most monthly income, accepting more volatility.", w_max),
    ]

    run = db.latest_run_info() or {}
    return {
        "budget": float(budget),
        "horizon_months": horizon_months,
        "as_of": run.get("run_date"),
        "data_source": run.get("data_source"),
        "plans": plans,
        "frontier": frontier,
        "excluded_risky": dropped_risky,
        "universe_used": [
            {"ticker": t, "name": scores[t]["name"], "risk": risk[i],
             "category_label": config.CATEGORY_LABELS.get(scores[t]["category"], ""),
             "annual_yield": round(float(mu[i]), 4)}
            for i, t in enumerate(tickers)
        ],
    }
