"""Feature engineering (Module 2 inputs) — features v2.

Builds the per-ETF, per-month feature panel used both for training (every
labelled month across history) and for live scoring (the latest month). Every
feature at month t uses only information available up to t — strictly
backward-looking, no look-ahead. There is deliberately NO expense_ratio (a fund
identity leak, not market data) and no fund-identity field.

Feature groups
  Payout : TTM run-rate trend 6/12/24m, run-rate drawdown from 24m peak,
           consecutive months of run-rate decline, payout volatility (CV of
           TTM month-over-month changes).
  Price  : 6m / 12m total return, 12m return volatility, price drawdown from a
           24m high.
  Yield  : current TTM yield, yield z-score vs the fund's own 36m history,
           yield relative to the cross-sectional median of its category.
  History: ever_cut (backward realized), months since last realized cut, log age.
  Category one-hots.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from . import labels

FEATURE_COLUMNS = [
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

# Threshold used for the *backward-looking* realized-cut history features
# (ever_cut, months_since_cut). Independent of the forward label threshold — it
# is a distress marker, not the target.
_HIST_THR = 0.15

# Column the transparent "dumb rule" fallback / benchmark ranks on.
DUMB_FEATURE = "payout_trend_12"


def _features_for(ticker: str, prices: pd.Series, divs: pd.Series,
                  category: str) -> pd.DataFrame:
    n = len(prices)
    idx = prices.index
    df = pd.DataFrame(index=idx)
    df["ticker"] = ticker
    df["date"] = idx
    df["category"] = category

    ttm = labels.ttm_runrate(divs)  # trailing-12m sum, NaN before month 12

    # ---- payout ---- (guard zero denominators for funds that started paying
    # mid-life)
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
    ttm_v = ttm.values
    ttm_diff_v = ttm.diff().values
    for i in range(n):
        if np.isnan(ttm_v[i]) or np.isnan(ttm_diff_v[i]):
            c = 0
            run[i] = np.nan
        else:
            c = c + 1 if dv[i] == 1 else 0
            run[i] = c
    df["rr_decline_months"] = run

    # payout volatility: CV of TTM month-over-month pct changes over 24m
    pct = ttm.pct_change()
    df["payout_cv"] = (pct.rolling(24, min_periods=12).std()
                       / pct.rolling(24, min_periods=12).mean().abs().replace(0.0, np.nan))

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
    for cc in ("covered_call", "equity_income", "bond", "reit"):
        df[f"cat_{cc}"] = 1.0 if category == cc else 0.0

    return df


def build_full_panel(data: dict) -> pd.DataFrame:
    """Long feature+label panel over all funds (NaN labels kept).

    Columns: ticker, date, category, label, price, + FEATURE_COLUMNS. The
    cross-sectional ``yield_vs_cat`` feature and the forward cut label are added
    here because they need the whole cohort / full series in view.
    """
    frames = []
    prices_by = {}
    for ticker, d in data.items():
        prices = d["prices"]
        divs = d["dividends"]
        # align dividends onto the price index (0 where no distribution)
        divs = divs.reindex(prices.index).fillna(0.0)
        category = config.META[ticker]["category"]
        f = _features_for(ticker, prices, divs, category)
        f["label"] = labels.cut_labels(divs).values
        f["price"] = prices.values
        frames.append(f)
        prices_by[ticker] = prices

    panel = pd.concat(frames, ignore_index=True)
    panel["date"] = pd.to_datetime(panel["date"])

    # cross-sectional: fund TTM-yield relative to same-category median that month
    cat_med = panel.groupby(["date", "category"])["ttm_yield"].transform("median")
    panel["yield_vs_cat"] = panel["ttm_yield"] / cat_med.replace(0.0, np.nan) - 1.0

    # sanitize: kill inf, clip runaway ratios (funds ramping distributions from ~0)
    panel[FEATURE_COLUMNS] = panel[FEATURE_COLUMNS].replace([np.inf, -np.inf], np.nan)
    for c in ("payout_trend_6", "payout_trend_12", "payout_trend_24", "yield_vs_cat"):
        panel[c] = panel[c].clip(-1.0, 5.0)
    panel["payout_cv"] = panel["payout_cv"].clip(0.0, 20.0)
    return panel


def panel_to_xy(panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.DatetimeIndex]:
    """Split a full panel into (X, y, dates) over its labelled rows.

    NaN feature values are kept: CatBoost handles them natively and the logistic
    baseline imputes them, matching the study protocol.
    """
    labelled = panel[panel["label"].notna()].copy()
    X = labelled[FEATURE_COLUMNS].copy()
    y = labelled["label"].astype(int)
    dates = pd.DatetimeIndex(labelled["date"])
    return X, y, dates


def build_training_panel(data: dict) -> tuple[pd.DataFrame, pd.Series, pd.DatetimeIndex]:
    """Every ETF's labelled months as one training set (X, y, dates).

    Signature preserved for pipeline / callers; implemented on top of
    ``build_full_panel``.
    """
    return panel_to_xy(build_full_panel(data))


def latest_features(data: dict) -> pd.DataFrame:
    """One feature row per ETF, at its most recent month (for scoring).

    Uses the cross-sectional panel (so ``yield_vs_cat`` is populated) and takes
    the last row per ticker. Returns a frame indexed by ticker with
    FEATURE_COLUMNS plus the live ``price``.
    """
    panel = build_full_panel(data)
    rows = []
    for ticker, d in data.items():
        g = panel[panel["ticker"] == ticker]
        if g.empty:
            continue
        row = g.iloc[-1]
        record = {"ticker": ticker, "price": float(d["attrs"]["last_price"])}
        for col in FEATURE_COLUMNS:
            record[col] = row[col]
        rows.append(record)
    return pd.DataFrame(rows).set_index("ticker")
