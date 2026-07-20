"""Data ingestion (Module 1, data side).

Primary path: pull monthly close prices, distributions, and a few fund
attributes from Yahoo Finance, then cache them to Parquet.

Fallback path: if Yahoo is unreachable or rate-limited, generate a
deterministic synthetic history per ETF so the entire DSS still runs end to
end. Synthetic series are seeded by ticker (reproducible) and are shaped per
category -- covered-call funds carry high but cut-prone payouts, bonds are
boringly stable -- so the classifier and optimizer have realistic structure to
work with.
"""
from __future__ import annotations

import hashlib
import sys
from typing import NamedTuple

import numpy as np
import pandas as pd

from .. import config
from ..storage import cache

END = pd.Timestamp.today().normalize()
N_MONTHS = 144  # ~12 years of history

def _naive(index) -> pd.DatetimeIndex:
    """Strip timezone info if present (Yahoo returns tz-aware indices)."""
    idx = pd.to_datetime(index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    return idx


# Per-category synthetic parameters (named fields so lookups can't silently
# grab the wrong column the way a bare positional index can).
class _CatParams(NamedTuple):
    yield_base: float
    price_mu: float
    price_vol: float
    expense_ratio: float
    start_price: float


_CAT_PARAMS = {
    "covered_call":  _CatParams(0.090, 0.020, 0.130, 0.0065, 20.0),
    "equity_income": _CatParams(0.045, 0.050, 0.120, 0.0035, 25.0),
    "reit":          _CatParams(0.052, 0.030, 0.160, 0.0055, 18.0),
    "bond":          _CatParams(0.028, 0.010, 0.050, 0.0010, 28.0),
}

# How cut-prone (and how likely to be in a current decline) each category is.
_CAT_RISK = {"covered_call": 0.75, "reit": 0.50, "equity_income": 0.28, "bond": 0.10}


def _seed(ticker: str) -> int:
    """Stable per-ticker seed (Python's hash() is salted per process)."""
    return int(hashlib.md5(ticker.encode()).hexdigest(), 16) % (2**32)


# --------------------------------------------------------------------------- #
# Synthetic generator
#
# History contains recurring "decline episodes" (a sustained downward ramp in
# the distribution rate), so cuts follow an observable falling trend and the
# classifier learns a real signal. The most-recent months are forced into a
# clear regime -- declining for distressed funds, flat/rising otherwise -- so
# the live snapshot shows a believable Safe/Watch/Risky spread by category.
# --------------------------------------------------------------------------- #
def _synthetic(ticker: str, category: str) -> dict:
    rng = np.random.default_rng(_seed(ticker))
    base, mu, vol, er, start = _CAT_PARAMS[category]
    cat_risk = _CAT_RISK[category]
    idx = pd.date_range(end=END, periods=N_MONTHS, freq="ME")

    # Price path (geometric random walk)
    rets = rng.normal(mu / 12.0, vol / np.sqrt(12.0), N_MONTHS)
    price = start * np.cumprod(1.0 + rets)

    # Distribution-rate path: long, gradual decline episodes (so a falling
    # payout *leads* the eventual cut), with mean-reverting recovery between
    # episodes so average yields stay realistic by category.
    rate = np.empty(N_MONTHS)
    r = base
    episode = 0
    ep_drop = 0.0
    for i in range(N_MONTHS):
        if episode == 0 and i < N_MONTHS - 14 and rng.random() < cat_risk * 0.015:
            episode = int(rng.integers(14, 22))     # long, slow decline
            ep_drop = rng.uniform(0.02, 0.035)
        if episode > 0:
            r *= 1.0 - ep_drop
            episode -= 1
        else:
            r += (base - r) * 0.03                   # gentle recovery toward base
            r *= 1.0 + rng.normal(0.001, 0.003)
        r = max(r, base * 0.45)
        rate[i] = r

    # Force the current regime for a clear, category-driven demo spread.
    tail = 14
    anchor = rate[N_MONTHS - tail - 1]
    declining_now = rng.random() < cat_risk
    if declining_now:
        drop = 0.10 + 0.30 * cat_risk
        for k in range(tail):
            rate[N_MONTHS - tail + k] = anchor * (1.0 - drop * (k + 1) / tail)
    else:
        for k in range(tail):
            rate[N_MONTHS - tail + k] = anchor * (1.0 + 0.02 * (k + 1) / tail)

    divs = price * rate / 12.0
    prices = pd.Series(price, index=idx)
    dividends = pd.Series(divs, index=idx)

    return {
        "prices": prices,
        "dividends": dividends,
        "attrs": {
            "expense_ratio": er,
            "age_months": N_MONTHS,
            "last_price": float(price[-1]),
        },
        "source": "synthetic",
    }


# --------------------------------------------------------------------------- #
# Yahoo Finance path
# --------------------------------------------------------------------------- #
def _from_yahoo(ticker: str) -> dict | None:
    try:
        import yfinance as yf

        tk = yf.Ticker(ticker)
        hist = tk.history(period="max", auto_adjust=False)
        if hist is None or hist.empty:
            return None
        close = hist["Close"].copy()
        close.index = _naive(close.index)
        prices = close.resample("ME").last().dropna()

        divs_raw = tk.dividends
        if divs_raw is not None and len(divs_raw):
            divs_raw.index = _naive(divs_raw.index)
            dividends = divs_raw.resample("ME").sum()
        else:
            dividends = pd.Series(dtype=float)
        # align dividends onto the price index (0 where no distribution)
        dividends = dividends.reindex(prices.index, fill_value=0.0)

        # NOTE: short real history is returned as-is. The pipeline's age screen
        # (MIN_AGE_MONTHS) is the arbiter of "too new" — substituting synthetic
        # history here would fabricate age_months and defeat that screen.

        info = {}
        try:
            info = tk.info or {}
        except Exception:
            info = {}
        er = (info.get("netExpenseRatio") or info.get("annualReportExpenseRatio")
              or info.get("expenseRatio"))
        if er is not None and er > 1:   # sometimes reported in percent
            er = er / 100.0

        return {
            "prices": prices,
            "dividends": dividends,
            "attrs": {
                "expense_ratio": er,
                "age_months": len(prices),
                "last_price": float(prices.iloc[-1]),
            },
            "source": "yahoo",
        }
    except Exception:
        return None


def _from_cache(ticker: str) -> dict | None:
    """Reuse the last cached (real) series when Yahoo is unavailable, so a
    rate-limited or offline run keeps serving real data instead of regressing
    to synthetic. Returns None if there is no usable cache to fall back on."""
    prices = cache.read_prices(ticker)
    if prices is None or prices.empty:
        return None
    divs = cache.read_dividends(ticker)
    if divs is None:
        divs = prices * 0.0
    return {
        "prices": prices,
        "dividends": divs,
        "attrs": {"expense_ratio": None, "age_months": len(prices),
                  "last_price": float(prices.iloc[-1])},
        "source": "cached",
    }


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def ingest_universe(force_synthetic: bool = False) -> dict:
    """Fetch + cache every ETF. Returns {ticker: attrs} and the data source."""
    attrs: dict[str, dict] = {}
    sources: set[str] = set()

    for entry in config.UNIVERSE:
        ticker, category = entry["ticker"], entry["category"]
        rec = None if force_synthetic else _from_yahoo(ticker)
        # Yahoo down/rate-limited: fall back to the cached real series first,
        # and only synthesize if there is no cache at all.
        if rec is None and not force_synthetic:
            rec = _from_cache(ticker)
            if rec is None:
                print(f"[ingest] WARNING: {ticker}: no Yahoo data and no cache — "
                      f"substituting synthetic history", file=sys.stderr)
        if rec is None:
            rec = _synthetic(ticker, category)

        # Don't overwrite the cache when we're serving it back (keeps the real
        # committed series intact across a failed live pull).
        if rec["source"] != "cached":
            cache.write_prices(ticker, rec["prices"])
            cache.write_dividends(ticker, rec["dividends"])
        a = rec["attrs"]
        if a.get("expense_ratio") is None:
            a["expense_ratio"] = _CAT_PARAMS[category].expense_ratio
        attrs[ticker] = a
        sources.add(rec["source"])

    # "yahoo" and "cached" are both real data; only synthetic degrades the run.
    if "synthetic" not in sources:
        data_source = "yahoo"
    elif sources == {"synthetic"}:
        data_source = "synthetic"
    else:
        data_source = "mixed"
    return {"attrs": attrs, "data_source": data_source}
