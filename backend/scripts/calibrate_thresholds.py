"""Recalibrate SAFE_MAX / RISKY_MIN for the new (6mo + persistence) label.

Trains the service model (GB) on the time split, then inspects the out-of-sample
test-fold probabilities to pick thresholds by *precision*, not by the old hard
0.25/0.55 cutoffs (which were tuned to the synthetic base rate and flag almost
nothing at the real ~4% base rate).

  RISKY_MIN  -> lowest prob whose Risky flag still has >= TARGET_RISKY_PREC precision
  SAFE_MAX   -> prob below which the cut rate is <= SAFE_RATE (safe to call "Safe")
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score

from app import config
from app.storage import cache
from app.features import build_features as bf
from app.models.classifier import _build_models

TARGET_RISKY_PREC = 0.50   # of funds we call Risky, aim >=50% actually cut
SAFE_RATE = 0.02           # Safe bucket should contain <=2% actual cutters

raw = {}
for e in config.UNIVERSE:
    t = e["ticker"]
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    if t in config.LEVERAGED_TICKERS or len(p) < config.MIN_AGE_MONTHS:
        continue
    d = cache.read_dividends(t)
    raw[t] = {"prices": p, "dividends": d if d is not None else p * 0.0,
              "attrs": {"last_price": float(p.iloc[-1]), "age_months": len(p), "expense_ratio": 0.005}}

X, y, dates = bf.build_training_panel(raw)
yr = pd.DatetimeIndex(dates).year
tr, te = np.asarray(yr <= config.TRAIN_END_YEAR), np.asarray(yr >= config.TEST_START_YEAR)
gb, _ = _build_models()
gb = clone(gb).fit(X[tr], y[tr])
p_te = gb.predict_proba(X[te])[:, 1]
y_te = y[te].to_numpy()
auc = roc_auc_score(y_te, p_te)
print(f"GB test AUC (new label) = {auc:.4f} | test n={len(y_te)} pos={int(y_te.sum())} "
      f"base_rate={y_te.mean()*100:.1f}%")

# sweep thresholds
grid = np.round(np.arange(0.05, 0.96, 0.01), 2)
def prec_at(thr):
    flag = p_te >= thr
    return (y_te[flag].mean() if flag.sum() else np.nan), int(flag.sum())
def safe_rate_below(thr):
    m = p_te < thr
    return (y_te[m].mean() if m.sum() else 0.0), int(m.sum())

risky_min = None
for thr in grid:
    prec, n = prec_at(thr)
    if n >= 5 and prec >= TARGET_RISKY_PREC:
        risky_min = thr; break

safe_max = None
for thr in grid:
    rate, n = safe_rate_below(thr)
    if rate <= SAFE_RATE:
        safe_max = thr   # keep raising while still under the safe rate
print("\nthr  precision(Risky>=thr)  n_flagged   |   cutRate(<thr) n_safe")
for thr in [0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45,0.50,0.55,0.60]:
    pr,nf = prec_at(thr); sr,ns = safe_rate_below(thr)
    print(f"{thr:.2f}   {('%.2f'%pr) if not np.isnan(pr) else '  - ':>6}  n={nf:<4d}          {sr*100:5.1f}%  n={ns}")

print(f"\nSUGGEST  RISKY_MIN = {risky_min}   (first thr with Risky precision >= {TARGET_RISKY_PREC})")
print(f"SUGGEST  SAFE_MAX  = {safe_max}   (highest thr keeping <thr cut-rate <= {SAFE_RATE*100:.0f}%)")
