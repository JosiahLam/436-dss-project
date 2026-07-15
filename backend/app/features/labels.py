"""Dividend-cut label definition.

The label is the answer key the classifier learns from. The subtlety (and the
whole point of the value proposition) is separating a *real* distribution cut
from return-of-capital noise or a single lumpy month. We do that by smoothing
the monthly distribution into a trailing run-rate, then comparing the run-rate
now against the run-rate FORWARD_MONTHS ahead -- both smoothed, so a transient
dip does not count.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config


def run_rate(dividends: pd.Series) -> pd.Series:
    """Trailing smoothed monthly distribution ($/month run-rate)."""
    return dividends.rolling(config.RUNRATE_WINDOW, min_periods=1).mean()


def cut_labels(dividends: pd.Series) -> pd.Series:
    """1 if the run-rate is cut by > CUT_THRESHOLD and *stays* cut, else 0.

    We compare the current run-rate against the average run-rate over the
    PERSIST_MONTHS window that begins FORWARD_MONTHS ahead -- i.e. months
    [t+FORWARD_MONTHS, t+FORWARD_MONTHS+PERSIST_MONTHS). A dip that recovers
    inside that window averages back up and is not labelled a cut.

    NaN where the forward window is unknown (right-censored tail) or where
    there is no distribution to cut.
    """
    rr = run_rate(dividends)
    H, K = config.FORWARD_MONTHS, config.PERSIST_MONTHS
    # Mean run-rate over [t+H, t+H+K): shift the horizon in, average K months,
    # then re-align so the value lands back at t.
    future = rr.shift(-H).rolling(K, min_periods=K).mean().shift(-(K - 1))
    label = (future < (1.0 - config.CUT_THRESHOLD) * rr).astype(float)
    label[future.isna()] = np.nan          # censored: no label yet
    label[rr.fillna(0.0) <= 0.0] = np.nan   # nothing to cut
    return label
