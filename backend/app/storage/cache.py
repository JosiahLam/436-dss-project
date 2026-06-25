"""Parquet cache for the bulky market time-series.

yfinance is slow and rate-limited (2,000 req/hr), so we never re-pull on a user
request. The monthly pipeline writes prices/dividends here; the API reads them.
"""
from __future__ import annotations

import pandas as pd

from .. import config


def _safe(ticker: str) -> str:
    return ticker.replace("/", "_")


def write_prices(ticker: str, prices: pd.Series) -> None:
    """Persist a monthly close-price series (DatetimeIndex -> float)."""
    df = prices.rename("close").to_frame()
    df.index.name = "date"
    df.to_parquet(config.PRICES_DIR / f"{_safe(ticker)}.parquet")


def write_dividends(ticker: str, divs: pd.Series) -> None:
    """Persist a monthly distribution series (DatetimeIndex -> float)."""
    df = divs.rename("dividend").to_frame()
    df.index.name = "date"
    df.to_parquet(config.DIVS_DIR / f"{_safe(ticker)}.parquet")


def read_prices(ticker: str) -> pd.Series | None:
    path = config.PRICES_DIR / f"{_safe(ticker)}.parquet"
    if not path.exists():
        return None
    return pd.read_parquet(path)["close"]


def read_dividends(ticker: str) -> pd.Series | None:
    path = config.DIVS_DIR / f"{_safe(ticker)}.parquet"
    if not path.exists():
        return None
    return pd.read_parquet(path)["dividend"]


def is_cached(ticker: str) -> bool:
    return (config.PRICES_DIR / f"{_safe(ticker)}.parquet").exists()
