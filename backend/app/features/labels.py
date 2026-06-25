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
    """1 if the run-rate is cut by > CUT_THRESHOLD within FORWARD_MONTHS, else 0.

    NaN where the forward window is unknown (the last FORWARD_MONTHS are
    right-censored) or where there is no distribution to cut.
    """
    rr = run_rate(dividends)
    future = rr.shift(-config.FORWARD_MONTHS)
    label = (future < (1.0 - config.CUT_THRESHOLD) * rr).astype(float)
    label[future.isna()] = np.nan          # censored: no label yet
    label[rr.fillna(0.0) <= 0.0] = np.nan   # nothing to cut
    return label
