"""FEATURES v2 - strictly backward-looking features from prices + dividends only.

All features are trailing (no look-ahead). No expense_ratio (identity leak and not
real data). No fund-identity fields. Category one-hots kept.

Feature groups
  Payout : TTM run-rate trend 6/12/24m, run-rate drawdown from 24m peak,
           consecutive months of run-rate decline, payout volatility (CV of TTM changes).
  Price  : 6m/12m total return, 12m return volatility, price drawdown from 24m high.
  Yield  : current TTM yield, yield z-score vs the fund's own 36m history,
           yield relative to the cross-sectional median of its category that month.
  History: ever_cut (backward realized), months since last realized cut, log age.
  Category one-hots.

Importable. `build_feature_panel()` returns a long DataFrame indexed by row with
columns: ticker, date, category, + FEATURE_COLUMNS_V2 (+ raw helpers). Labels are
attached separately by the caller (bakeoff) so the same feature panel serves every
label variant.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import label_v2 as L

# thr used for the *backward-looking* realized-cut history features (ever_cut,
# months_since_cut). Independent of the label threshold; a distress marker.
_HIST_THR = 0.15

FEATURE_COLUMNS_V2 = [
    # payout
    "payout_trend_6", "payout_trend_12", "payout_trend_24",
    "rr_drawdown_24", "rr_decline_months", "payout_cv",
    # price
    "ret_6", "ret_12", "ret_vol_12", "price_drawdown_24",
    # yield
    "ttm_yield", "yield_z_36", "yield_vs_cat",
    # history
    "ever_cut", "months_since_cut", "age_log",
    # category
    "cat_covered_call", "cat_equity_income", "cat_bond", "cat_reit",
]

# the single feature the "dumb rule" ranks on (negative trend => likely cut)
DUMB_FEATURE = "payout_trend_12"


def _features_for(ticker: str, prices: pd.Series, divs: pd.Series, category: str) -> pd.DataFrame:
    n = len(prices)
    idx = prices.index
    df = pd.DataFrame(index=idx)
    df["ticker"] = ticker
    df["date"] = idx
    df["category"] = category

    ttm = L.ttm_runrate(divs)  # trailing-12m sum, NaN before month 12

    # ---- payout ---- (guard zero denominators from funds that started paying mid-life)
    df["payout_trend_6"] = ttm / ttm.shift(6).replace(0.0, np.nan) - 1.0
    df["payout_trend_12"] = ttm / ttm.shift(12).replace(0.0, np.nan) - 1.0
    df["payout_trend_24"] = ttm / ttm.shift(24).replace(0.0, np.nan) - 1.0
    peak24 = ttm.rolling(24, min_periods=12).max()
    df["rr_drawdown_24"] = ttm / peak24 - 1.0
    # consecutive months of TTM decline
    dec = (ttm.diff() < 0).astype(float)
    run = np.zeros(n)
    c = 0
    dv = dec.values
    for i in range(n):
        if np.isnan(ttm.values[i]) or np.isnan(ttm.diff().values[i]):
            c = 0
            run[i] = np.nan
        else:
            c = c + 1 if dv[i] == 1 else 0
            run[i] = c
    df["rr_decline_months"] = run
    # payout volatility: CV of TTM month-over-month pct changes over 24m
    pct = ttm.pct_change()
    df["payout_cv"] = pct.rolling(24, min_periods=12).std() / pct.rolling(24, min_periods=12).mean().abs().replace(0.0, np.nan)

    # ---- price ----
    df["ret_6"] = prices / prices.shift(6) - 1.0
    df["ret_12"] = prices / prices.shift(12) - 1.0
    mret = prices.pct_change()
    df["ret_vol_12"] = mret.rolling(12, min_periods=6).std()
    df["price_drawdown_24"] = prices / prices.rolling(24, min_periods=12).max() - 1.0

    # ---- yield ----
    ttm_yield = ttm / prices
    df["ttm_yield"] = ttm_yield
    ymean = ttm_yield.rolling(36, min_periods=18).mean()
    ystd = ttm_yield.rolling(36, min_periods=18).std()
    df["yield_z_36"] = (ttm_yield - ymean) / ystd.replace(0.0, np.nan)

    # ---- history (backward realized cut) ----
    peak_prev = ttm.cummax().shift(1)
    realized = (ttm < (1.0 - _HIST_THR) * peak_prev).fillna(False)
    df["ever_cut"] = realized.cummax().astype(float)
    ev = realized.values
    msc = np.empty(n)
    last = -1
    for i in range(n):
        if ev[i]:
            last = i
        msc[i] = (i - last) if last >= 0 else i
    df["months_since_cut"] = msc
    df["age_log"] = np.log1p(np.arange(1, n + 1))

    # ---- category one-hots ----
    for c in ("covered_call", "equity_income", "bond", "reit"):
        df[f"cat_{c}"] = 1.0 if category == c else 0.0

    return df


def build_feature_panel(raw: dict | None = None) -> pd.DataFrame:
    """Long feature panel over all funds. `yield_vs_cat` is added cross-sectionally."""
    if raw is None:
        raw = L.load_raw()
    frames = [_features_for(t, r["prices"], r["divs"], r["category"]) for t, r in raw.items()]
    panel = pd.concat(frames, ignore_index=True)

    # cross-sectional: fund TTM-yield relative to same-category median that month
    cat_med = panel.groupby(["date", "category"])["ttm_yield"].transform("median")
    panel["yield_vs_cat"] = panel["ttm_yield"] / cat_med.replace(0.0, np.nan) - 1.0

    # sanitize: kill inf, clip runaway ratios (funds ramping distributions from ~0)
    panel[FEATURE_COLUMNS_V2] = panel[FEATURE_COLUMNS_V2].replace([np.inf, -np.inf], np.nan)
    for c in ("payout_trend_6", "payout_trend_12", "payout_trend_24", "yield_vs_cat"):
        panel[c] = panel[c].clip(-1.0, 5.0)
    panel["payout_cv"] = panel["payout_cv"].clip(0.0, 20.0)
    return panel


if __name__ == "__main__":
    p = build_feature_panel()
    print(f"feature panel: {len(p)} rows, {p['ticker'].nunique()} funds")
    print("columns:", [c for c in FEATURE_COLUMNS_V2])
    print(p[FEATURE_COLUMNS_V2].describe().T[["count", "mean", "std", "min", "max"]].to_string())
