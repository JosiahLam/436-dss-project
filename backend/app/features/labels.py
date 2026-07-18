"""Dividend-cut label definition (v2 — frequency-robust, censoring-aware).

The label is the answer key the classifier learns from. The subtlety (and the
whole point of the value proposition) is separating a *real* distribution cut
from return-of-capital noise, a single lumpy month, or a mere change of payment
cadence. v2 does that by measuring the distribution as a trailing-12-month (TTM)
*sum* rather than a short rolling mean:

  * A TTM sum is invariant to payment frequency, so a quarterly / annual / lumpy
    payer no longer produces phantom cuts the way a 3-month rolling mean did.
  * ``cut`` at month t = forward TTM (FORWARD_MONTHS ahead) < (1-thr) x TTM(t).
  * A full 12-month trailing window is required, which also removes the ramp-up
    phantom cuts of a fund's first year.
  * Right-censor guard: rows whose forward measurement point lands within
    CENSOR_GUARD_MONTHS of the panel end get label = NaN (not yet observable).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config


def ttm_runrate(dividends: pd.Series) -> pd.Series:
    """Trailing-12-month distribution *sum* (full 12m window required)."""
    return dividends.rolling(12, min_periods=12).sum()


def run_rate(dividends: pd.Series) -> pd.Series:
    """Monthly-equivalent distribution run-rate ($/month) for display.

    This is the TTM sum divided by 12, so it stays on the same "$ per month"
    scale the dashboard chart expects while inheriting the payment-frequency
    robustness of the TTM label. Before month 12 the TTM window is incomplete;
    we fall back to the trailing mean so the early chart still renders.
    """
    ttm = ttm_runrate(dividends)
    monthly = ttm / 12.0
    warmup = dividends.rolling(12, min_periods=1).mean()
    return monthly.fillna(warmup)


def cut_labels(dividends: pd.Series) -> pd.Series:
    """1 if the forward TTM run-rate is cut by > CUT_THRESHOLD, else 0.

    NaN where the label is undefined: no trailing window yet, nothing to cut, or
    the forward measurement point is right-censored (within CENSOR_GUARD_MONTHS
    of the panel end).
    """
    thr = config.CUT_THRESHOLD
    fwd = config.FORWARD_MONTHS
    guard = config.CENSOR_GUARD_MONTHS

    rr = ttm_runrate(dividends)
    future = rr.shift(-fwd)
    label = (future < (1.0 - thr) * rr).astype(float)
    label[future.isna()] = np.nan          # forward window unknown
    label[rr.isna()] = np.nan              # no trailing window yet
    label[rr.fillna(0.0) <= 0.0] = np.nan  # nothing to cut

    # Forward measurement index = i + fwd. Drop if it lands within `guard`
    # months of the panel end (right-censoring guard).
    n = len(dividends)
    pos = np.arange(n)
    bad = (pos + fwd) > (n - 1 - guard)
    label = label.copy()
    label.values[bad] = np.nan
    return label
