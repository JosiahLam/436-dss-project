"""Apples-to-apples: TabPFN vs GB (primary) vs LR (baseline) vs dumb rule.

Uses the exact same real-data training panel, feature set, and time split
(train <= 2021, test >= 2022) as app/models/classifier.py, so the AUCs are
directly comparable to what the live pipeline reported.
"""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score, precision_score

from app import config
from app.storage import cache
from app.features import build_features as bf
from app.models.classifier import _build_models

# --- rebuild the eligible real-data panel exactly like the pipeline ---------
data = {}
for t in config.TICKERS:
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    d = cache.read_dividends(t)
    a = {"last_price": float(p.iloc[-1]), "age_months": len(p), "expense_ratio": 0.005}
    data[t] = {"prices": p, "dividends": d if d is not None else p * 0.0, "attrs": a}

eligible = [t for t in data
            if t not in config.LEVERAGED_TICKERS
            and len(data[t]["prices"]) >= config.MIN_AGE_MONTHS]
train_data = {t: data[t] for t in eligible}

X, y, dates = bf.build_training_panel(train_data)
years = pd.DatetimeIndex(dates).year
tr = np.asarray(years <= config.TRAIN_END_YEAR)
te = np.asarray(years >= config.TEST_START_YEAR)
Xtr, ytr, Xte, yte = X[tr], y[tr], X[te], y[te]
print(f"panel: {len(y)} rows | train {tr.sum()} (pos {int(ytr.sum())}) | "
      f"test {te.sum()} (pos {int(yte.sum())})\n")

results = {}

# --- incumbent models -------------------------------------------------------
primary, baseline = _build_models()
for name, mdl in [("GB (HistGradientBoosting)", primary), ("LR (Logistic)", baseline)]:
    m = clone(mdl); t0 = time.time()
    m.fit(Xtr, ytr)
    auc = roc_auc_score(yte, m.predict_proba(Xte)[:, 1])
    results[name] = auc
    print(f"{name:28s} AUC={auc:.4f}  ({time.time()-t0:.1f}s)")

# --- dumb rule --------------------------------------------------------------
rule_auc = roc_auc_score(yte, (-Xte["payout_trend"]).fillna(0.0))
results["Rule (payout falling)"] = rule_auc
print(f"{'Rule (payout falling)':28s} AUC={rule_auc:.4f}")

# --- TabPFN -----------------------------------------------------------------
from tabpfn import TabPFNClassifier
device = "cpu"
clf = TabPFNClassifier(device=device, random_state=0, ignore_pretraining_limits=True)
t0 = time.time()
clf.fit(Xtr.to_numpy(dtype=np.float32), ytr.to_numpy())
proba = clf.predict_proba(Xte.to_numpy(dtype=np.float32))[:, 1]
tab_auc = roc_auc_score(yte, proba)
results["TabPFN v2"] = tab_auc
tab_prec = precision_score(yte, proba >= config.RISKY_MIN, zero_division=0)
print(f"{'TabPFN v2':28s} AUC={tab_auc:.4f}  risky_prec={tab_prec:.3f}  "
      f"({time.time()-t0:.1f}s on {device})")

print("\n=== ranking (test AUC, real data) ===")
for name, auc in sorted(results.items(), key=lambda kv: -kv[1]):
    print(f"  {auc:.4f}  {name}")
