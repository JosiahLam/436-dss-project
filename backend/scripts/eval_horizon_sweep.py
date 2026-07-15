"""Sweep the dividend-cut label horizon (FORWARD_MONTHS) over 3/6/12 months and
re-evaluate all four models on the same real-data time split each time.

Only the label changes across horizons; features and the train(<=2021)/
test(>=2022) split stay fixed, so AUCs are comparable within each row.
"""
import sys, time, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score, precision_score

from app import config
from app.storage import cache
from app.models.classifier import _build_models

# real-data inputs (built once; label recomputed per horizon)
raw = {}
for t in config.TICKERS:
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    d = cache.read_dividends(t)
    raw[t] = {"prices": p, "dividends": d if d is not None else p * 0.0,
              "attrs": {"last_price": float(p.iloc[-1]), "age_months": len(p),
                        "expense_ratio": 0.005}}
eligible = [t for t in raw
            if t not in config.LEVERAGED_TICKERS
            and len(raw[t]["prices"]) >= config.MIN_AGE_MONTHS]
train_data = {t: raw[t] for t in eligible}

from tabpfn import TabPFNClassifier

HORIZONS = [3, 6, 12]
rows = []
for h in HORIZONS:
    config.FORWARD_MONTHS = h
    # rebuild features/labels with the patched horizon
    import app.features.labels as labels_mod
    import app.features.build_features as bf
    importlib.reload(labels_mod)
    importlib.reload(bf)

    X, y, dates = bf.build_training_panel(train_data)
    years = pd.DatetimeIndex(dates).year
    tr = np.asarray(years <= config.TRAIN_END_YEAR)
    te = np.asarray(years >= config.TEST_START_YEAR)
    Xtr, ytr, Xte, yte = X[tr], y[tr], X[te], y[te]

    primary, baseline = _build_models()
    gb = roc_auc_score(yte, clone(primary).fit(Xtr, ytr).predict_proba(Xte)[:, 1])
    lr = roc_auc_score(yte, clone(baseline).fit(Xtr, ytr).predict_proba(Xte)[:, 1])
    rule = roc_auc_score(yte, (-Xte["payout_trend"]).fillna(0.0))

    t0 = time.time()
    clf = TabPFNClassifier(device="cpu", random_state=0, ignore_pretraining_limits=True)
    clf.fit(Xtr.to_numpy(dtype=np.float32), ytr.to_numpy())
    proba = clf.predict_proba(Xte.to_numpy(dtype=np.float32))[:, 1]
    tab = roc_auc_score(yte, proba)
    tab_prec = precision_score(yte, proba >= config.RISKY_MIN, zero_division=0)

    rows.append({
        "horizon_m": h, "test_rows": int(te.sum()), "test_pos": int(yte.sum()),
        "test_pos_pct": round(100 * yte.mean(), 2),
        "TabPFN": round(tab, 4), "LR": round(lr, 4), "GB": round(gb, 4),
        "Rule": round(rule, 4), "TabPFN_riskyprec": round(tab_prec, 3),
        "tab_sec": round(time.time() - t0, 1),
    })
    print(f"h={h:2d}m  pos={int(yte.sum()):3d}({yte.mean()*100:4.1f}%)  "
          f"TabPFN={tab:.4f}  LR={lr:.4f}  GB={gb:.4f}  Rule={rule:.4f}  "
          f"({rows[-1]['tab_sec']}s)")

print("\n=== horizon sweep (real data, test>=2022) ===")
print(pd.DataFrame(rows).to_string(index=False))
