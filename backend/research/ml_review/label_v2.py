"""LABEL v2 - frequency-robust, censoring-aware dividend-cut label.

Design (addresses prior audit findings):
  * Payment frequency inferred per fund (median gap between nonzero months).
  * Run-rate = trailing-12-month (TTM) *sum* of distributions. A TTM sum is
    invariant to payment cadence, so quarterly/annual/lumpy-special payers no
    longer generate phantom cuts the way a 3-month rolling *mean* did.
  * Optional 6-month annualized run-rate for monthly payers (compared empirically).
  * Cut(t) = forward-TTM (measured `fwd` months ahead) < (1-thr) * current TTM(t).
  * Right-censoring guard: rows whose forward measurement point lands within
    `censor_guard` months of the panel end are dropped (label = NaN).
  * A full 12-month trailing window is required for the current TTM (min age 12m),
    which also removes the ramp-up phantom cuts of a fund's first year.

Importable + reproducible.  No repo files are modified.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

REPO = "/home/user/436-dss-project"
sys.path.insert(0, os.path.join(REPO, "backend"))

from app import config  # noqa: E402
from app.storage import cache  # noqa: E402

TICKERS = config.TICKERS
META = config.META


# --------------------------------------------------------------------------- #
# Raw data
# --------------------------------------------------------------------------- #
def load_raw() -> dict:
    """ticker -> {prices, divs (0-filled, monthly), category}. Prices+divs share index."""
    out = {}
    for t in TICKERS:
        p = cache.read_prices(t)
        if p is None or p.empty:
            continue
        d = cache.read_dividends(t)
        if d is None:
            d = p * 0.0
        d = d.reindex(p.index).fillna(0.0)
        out[t] = {"prices": p, "divs": d, "category": META[t]["category"]}
    return out


# --------------------------------------------------------------------------- #
# Frequency inference
# --------------------------------------------------------------------------- #
def infer_frequency(divs: pd.Series) -> tuple[float, str]:
    nz = np.where(divs.values > 0)[0]
    if len(nz) < 2:
        return np.nan, "unknown"
    med = float(np.median(np.diff(nz)))
    if med <= 1.3:
        freq = "monthly"
    elif med <= 3.6:
        freq = "quarterly"
    elif med <= 7:
        freq = "semi/irregular"
    else:
        freq = "annual/sparse"
    return med, freq


# --------------------------------------------------------------------------- #
# Run-rate definitions
# --------------------------------------------------------------------------- #
def ttm_runrate(divs: pd.Series) -> pd.Series:
    """Trailing-12-month distribution *sum* (full window required)."""
    return divs.rolling(12, min_periods=12).sum()


def smoothed6_runrate(divs: pd.Series) -> pd.Series:
    """6-month distribution sum annualized (x2). Audit's alternative for monthly payers."""
    return divs.rolling(6, min_periods=6).sum() * 2.0


# --------------------------------------------------------------------------- #
# Label
# --------------------------------------------------------------------------- #
def cut_labels_v2(
    divs: pd.Series,
    thr: float = 0.15,
    fwd: int = 12,
    mode: str = "ttm",
    censor_guard: int = 2,
) -> pd.Series:
    """Return a float label Series (1=cut, 0=no cut, NaN=undefined) aligned to divs.index."""
    rr = ttm_runrate(divs) if mode == "ttm" else smoothed6_runrate(divs)
    future = rr.shift(-fwd)
    label = (future < (1.0 - thr) * rr).astype(float)
    label[future.isna()] = np.nan
    label[rr.isna()] = np.nan
    label[rr.fillna(0.0) <= 0.0] = np.nan

    n = len(divs)
    pos = np.arange(n)
    # forward measurement index = i + fwd. Drop if it lands within censor_guard of the end.
    bad = (pos + fwd) > (n - 1 - censor_guard)
    label = label.copy()
    label.values[bad] = np.nan
    return label


# --------------------------------------------------------------------------- #
# Episode / churn diagnostics
# --------------------------------------------------------------------------- #
def episode_stats(label: pd.Series) -> tuple[int, list]:
    """Count consecutive positive runs; NaN or 0 breaks a run. Returns (n_episodes, run_lengths)."""
    lab = label.values
    runs, cur = [], 0
    for v in lab:
        if v == 1:
            cur += 1
        else:
            if cur > 0:
                runs.append(cur)
            cur = 0
    if cur > 0:
        runs.append(cur)
    return len(runs), runs


def churn_fraction(divs: pd.Series, thr: float, fwd: int, mode: str, recover: int = 6) -> tuple[int, float]:
    """Of positive rows, fraction whose run-rate recovers to >= (1-thr)*base within
    `recover` months after the forward window (i.e. the cut was transient)."""
    rr = ttm_runrate(divs) if mode == "ttm" else smoothed6_runrate(divs)
    lab = cut_labels_v2(divs, thr, fwd, mode)
    recov = rr.shift(-(fwd + recover))
    n_pos = n_churn = 0
    for i in range(len(lab)):
        if lab.iloc[i] == 1:
            n_pos += 1
            base = rr.iloc[i]
            r = recov.iloc[i]
            if not np.isnan(r) and r >= (1.0 - thr) * base:
                n_churn += 1
    return n_pos, (n_churn / n_pos if n_pos else np.nan)


# --------------------------------------------------------------------------- #
# Panel builders
# --------------------------------------------------------------------------- #
def label_panel(raw: dict, thr: float = 0.15, fwd: int = 12, mode: str = "ttm") -> pd.DataFrame:
    """Long panel: ticker, date, category, div, label (NaN kept)."""
    frames = []
    for t, rec in raw.items():
        divs = rec["divs"]
        df = pd.DataFrame({"div": divs.values})
        df["date"] = divs.index
        df["ticker"] = t
        df["category"] = rec["category"]
        df["label"] = cut_labels_v2(divs, thr, fwd, mode).values
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def old_label_panel(raw: dict) -> pd.DataFrame:
    """Production label: 3-month run-rate MEAN, thr 0.15, fwd 12 (no censoring guard)."""
    from app.features import labels as prod_labels

    frames = []
    for t, rec in raw.items():
        divs = rec["divs"]
        df = pd.DataFrame({"div": divs.values})
        df["date"] = divs.index
        df["ticker"] = t
        df["category"] = rec["category"]
        df["label"] = prod_labels.cut_labels(divs).values
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def validation_report(raw: dict, thr: float, fwd: int, mode: str) -> dict:
    """Compute label-v2 validation numbers: totals, episodes, churn, freq-stratified pos rate."""
    panel = label_panel(raw, thr, fwd, mode).dropna(subset=["label"])
    tot = len(panel)
    pos = int(panel["label"].sum())

    # episodes / churn aggregated per ticker
    n_ep = 0
    churn_pos = churn_ch = 0
    freq_of = {}
    for t, rec in raw.items():
        lab = cut_labels_v2(rec["divs"], thr, fwd, mode)
        e, _ = episode_stats(lab.dropna())
        n_ep += e
        np_, cf = churn_fraction(rec["divs"], thr, fwd, mode)
        churn_pos += np_
        churn_ch += int(round((cf if not np.isnan(cf) else 0) * np_))
        _, freq_of[t] = infer_frequency(rec["divs"])

    panel["freq"] = panel["ticker"].map(freq_of)
    q = panel[panel["freq"] == "quarterly"]
    m = panel[panel["freq"] == "monthly"]
    return {
        "thr": thr, "fwd": fwd, "mode": mode,
        "rows": tot, "positives": pos, "pos_rate": pos / tot if tot else np.nan,
        "episodes": n_ep,
        "churn_frac": churn_ch / churn_pos if churn_pos else np.nan,
        "quarterly_pos_rate": q["label"].mean() if len(q) else np.nan,
        "monthly_pos_rate": m["label"].mean() if len(m) else np.nan,
        "quarterly_rows": len(q), "monthly_rows": len(m),
    }


if __name__ == "__main__":
    raw = load_raw()
    print(f"funds loaded: {len(raw)}")
    grid = []
    for mode in ["ttm", "smooth6"]:
        for thr in [0.10, 0.15]:
            grid.append(validation_report(raw, thr, 12, mode))
    print(pd.DataFrame(grid).to_string(index=False))
