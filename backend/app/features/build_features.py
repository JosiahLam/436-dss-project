"""Feature engineering (Module 2 inputs).

Builds the per-ETF, per-month feature panel used both for training (every
mature month across history) and for live scoring (the latest month). Each
feature at month t uses only information available up to t -- no look-ahead.

Features (from the proposal's FEATURES list):
  payout_trend      slope of the distribution run-rate over 24m, annualized %
  payout_stability  coefficient of variation of the monthly distribution
  ever_cut          has this fund ever cut its run-rate before? (0/1)
  price_trend       annualized price return over the trailing window
  dist_yield        trailing-12m distributions / price
  expense_ratio     fund attribute
  age_months        months of history so far
  cat_*             ETF type one-hot (covered_call/equity_income/bond/reit)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from . import labels

FEATURE_COLUMNS = [
    "payout_trend",
    "payout_stability",
    "ever_cut",
    "price_trend",
    "dist_yield",
    "expense_ratio",
    "age_months",
    "cat_covered_call",
    "cat_equity_income",
    "cat_bond",
    "cat_reit",
]

# Columns that must be present (non-NaN) for a row to count as a usable sample.
_REQUIRED = ["payout_trend", "price_trend", "dist_yield", "payout_stability"]


def _rolling_slope(series: pd.Series, window: int) -> pd.Series:
    """Per-month slope of a series over a trailing window (OLS on time index)."""
    def _fit(y: np.ndarray) -> float:
        if np.isnan(y).all():
            return np.nan
        x = np.arange(len(y))
        return float(np.polyfit(x, y, 1)[0])

    return series.rolling(window, min_periods=max(4, window // 2)).apply(_fit, raw=True)


def feature_frame(ticker: str, prices: pd.Series, dividends: pd.Series,
                  attrs: dict, meta: dict) -> pd.DataFrame:
    df = pd.DataFrame({"price": prices, "div": dividends}).dropna(subset=["price"])
    df["div"] = df["div"].fillna(0.0)

    rr = labels.run_rate(df["div"])

    df["dist_yield"] = df["div"].rolling(12, min_periods=6).sum() / df["price"]

    slope = _rolling_slope(rr, config.PAYOUT_TREND_MONTHS)
    df["payout_trend"] = (slope * 12.0) / rr.replace(0.0, np.nan)

    roll_mean = df["div"].rolling(config.STABILITY_MONTHS, min_periods=6).mean()
    roll_std = df["div"].rolling(config.STABILITY_MONTHS, min_periods=6).std()
    df["payout_stability"] = roll_std / roll_mean.replace(0.0, np.nan)

    peak = rr.cummax().shift(1)
    dropped = (rr < (1.0 - config.CUT_THRESHOLD) * peak).fillna(False)
    df["ever_cut"] = dropped.cummax().astype(int)

    k = config.PRICE_TREND_MONTHS
    df["price_trend"] = (df["price"] / df["price"].shift(k).replace(0.0, np.nan) - 1.0) * (12.0 / k)

    df["expense_ratio"] = attrs.get("expense_ratio")
    df["age_months"] = np.arange(1, len(df) + 1)

    cat = meta["category"]
    for c in ("covered_call", "equity_income", "bond", "reit"):
        df[f"cat_{c}"] = 1.0 if cat == c else 0.0

    df["label"] = labels.cut_labels(df["div"])
    df["ticker"] = ticker
    return df


def build_training_panel(data: dict) -> tuple[pd.DataFrame, pd.Series, pd.DatetimeIndex]:
    """Concatenate every ETF's mature, labelled months into one training set."""
    frames = []
    for ticker, d in data.items():
        frames.append(feature_frame(ticker, d["prices"], d["dividends"],
                                    d["attrs"], config.META[ticker]))
    panel = pd.concat(frames)
    panel = panel.dropna(subset=["label"] + _REQUIRED)
    X = panel[FEATURE_COLUMNS].copy()
    y = panel["label"].astype(int)
    dates = pd.DatetimeIndex(panel.index)
    return X, y, dates


def latest_features(data: dict) -> pd.DataFrame:
    """One feature row per ETF, at its most recent mature month (for scoring)."""
    rows = []
    for ticker, d in data.items():
        f = feature_frame(ticker, d["prices"], d["dividends"],
                          d["attrs"], config.META[ticker])
        mature = f.dropna(subset=_REQUIRED)
        row = (mature.iloc[-1] if not mature.empty else f.iloc[-1]).copy()
        record = {"ticker": ticker, "price": float(d["attrs"]["last_price"])}
        for col in FEATURE_COLUMNS:
            record[col] = row[col]
        rows.append(record)
    return pd.DataFrame(rows).set_index("ticker")
