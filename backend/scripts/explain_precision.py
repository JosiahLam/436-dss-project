"""Reproduce the pipeline's risky_precision exactly and show the confusion counts.

Mirrors app/pipeline.run_pipeline's data construction (real attrs) + the
risky_precision block in app/models/classifier.train.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import precision_score, confusion_matrix

from app import config
from app.data import ingest
from app.features import build_features
from app.models.classifier import _build_models
from app.storage import cache

# --- rebuild eligible training data exactly like the pipeline (real attrs) ---
ing = ingest.ingest_universe(force_synthetic=False)
attrs_all = ing["attrs"]
data = {}
for t in config.TICKERS:
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    d = cache.read_dividends(t)
    data[t] = {"prices": p, "dividends": d if d is not None else p * 0.0,
               "attrs": attrs_all.get(t, {})}
eligible = [t for t in data
            if t not in config.LEVERAGED_TICKERS
            and (data[t]["attrs"].get("age_months") or len(data[t]["prices"])) >= config.MIN_AGE_MONTHS]
train_data = {t: data[t] for t in eligible}

X, y, dates = build_features.build_training_panel(train_data)
yr = pd.DatetimeIndex(dates).year
tr = np.asarray(yr <= config.TRAIN_END_YEAR)
te = np.asarray(yr >= config.TEST_START_YEAR)
Xtr, ytr, Xte, yte = X[tr], y[tr], X[te], y[te]

primary, _ = _build_models()
m = clone(primary).fit(Xtr, ytr)
proba = m.predict_proba(Xte)[:, 1]
flagged = proba >= config.RISKY_MIN          # RISKY_MIN = 0.35
yte_arr = yte.to_numpy().astype(int)

TP = int(((flagged) & (yte_arr == 1)).sum())
FP = int(((flagged) & (yte_arr == 0)).sum())
FN = int(((~flagged) & (yte_arr == 1)).sum())
n_flag = int(flagged.sum())
prec = precision_score(yte_arr, flagged, zero_division=0)

print(f"RISKY_MIN threshold      = {config.RISKY_MIN}")
print(f"test-fold rows (>=2022)  = {len(yte_arr)}   actual cuts (positives) = {int(yte_arr.sum())}")
print(f"flagged Risky (p>=thr)   = {n_flag}")
print(f"  TP (flagged & cut)     = {TP}")
print(f"  FP (flagged & no cut)  = {FP}")
print(f"  FN (missed cuts)       = {FN}")
print(f"precision = TP/(TP+FP)   = {TP}/{TP+FP} = {prec:.4f}")
print(f"recall    = TP/(TP+FN)   = {TP}/{TP+FN} = {TP/(TP+FN):.4f}")
