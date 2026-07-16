"""Quantify the benefit of moving the time split, holding label + model fixed.

Label: 6-month horizon + 6-month persistence.  Model: GB (the service model).
Compares the ORIGINAL split (train<=2021 / test>=2022) against a MOVED split
(train<=2022 / test>=2023). Reports overall test AUC plus, crucially, how much
covered-call data lands in TRAINING under each split (the whole reason to move).
"""
import sys, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score

from app import config
from app.storage import cache
import app.features.labels as labels_mod
from app.models.classifier import _build_models

PERSIST_K = 6
config.FORWARD_MONTHS = 6

def persistent_cut_labels(dividends):
    H = config.FORWARD_MONTHS
    rr = labels_mod.run_rate(dividends)
    fwd = rr.shift(-H).rolling(PERSIST_K, min_periods=PERSIST_K).mean().shift(-(PERSIST_K - 1))
    lab = (fwd < (1.0 - config.CUT_THRESHOLD) * rr).astype(float)
    lab[fwd.isna()] = np.nan
    lab[rr.fillna(0.0) <= 0.0] = np.nan
    return lab

labels_mod.cut_labels = persistent_cut_labels
import app.features.build_features as bf
importlib.reload(bf)

# eligible set = pipeline screen (drop leveraged + too-new)
raw = {}
for e in config.UNIVERSE:
    t = e["ticker"]
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    d = cache.read_dividends(t)
    if t in config.LEVERAGED_TICKERS or len(p) < config.MIN_AGE_MONTHS:
        continue
    raw[t] = {"prices": p, "dividends": d if d is not None else p * 0.0,
              "attrs": {"last_price": float(p.iloc[-1]), "age_months": len(p), "expense_ratio": 0.005}}

X, y, dates = bf.build_training_panel(raw)
years = pd.DatetimeIndex(dates).year
cats = X["cat_covered_call"].to_numpy()  # 1.0 where covered_call

def run(train_end, test_start, tag):
    tr = np.asarray(years <= train_end)
    te = np.asarray(years >= test_start)
    Xtr, ytr, Xte, yte = X[tr], y[tr], X[te], y[te]
    cc_tr = int(cats[tr].sum()); cc_tr_pos = int(y[tr & (cats == 1)].sum())
    gb, _ = _build_models()
    auc = roc_auc_score(yte, clone(gb).fit(Xtr, ytr).predict_proba(Xte)[:, 1])
    # covered-call-only test AUC (if both classes present)
    ccte = te & (cats == 1)
    yc = y[ccte]
    cc_auc = None
    if yc.nunique() == 2 and len(yc) >= 20:
        cc_auc = roc_auc_score(yc, clone(gb).fit(Xtr, ytr).predict_proba(X[ccte])[:, 1])
    print(f"\n[{tag}]  train<={train_end} / test>={test_start}")
    print(f"  train rows {tr.sum():5d} (pos {int(ytr.sum()):3d})   test rows {te.sum():5d} (pos {int(yte.sum()):3d})")
    print(f"  covered-call TRAIN rows {cc_tr:4d} (pos {cc_tr_pos:3d})")
    print(f"  overall test AUC {auc:.4f}" + (f"   covered-call-only test AUC {cc_auc:.4f}" if cc_auc else "   (cc-only AUC n/a)"))
    return auc

print("=== GB · 6-month persistence label · real data ===")
run(2021, 2022, "ORIGINAL split")
run(2022, 2023, "MOVED split")
