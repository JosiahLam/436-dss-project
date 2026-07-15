"""Re-sweep horizons 3/6/12 with a PERSISTENCE condition on the cut label.

Original label:   cut(t)=1 if run_rate(t+H) < 0.85*run_rate(t)   (a single point;
                  catches transient monthly-distribution dips).
Persistent label: cut(t)=1 if the run-rate is STILL >15% below the pre-cut level
                  on average across the K months following t+H, i.e.
                  mean(run_rate[t+H : t+H+K]) < 0.85*run_rate(t).  (a dip that
                  does not recover -> a genuine sustained reduction).

Reports, per horizon: distinct ETFs that cut, episodes, positive months, and the
four model test-AUCs, so we can see whether the h=3 signal survives once noise
is filtered out.
"""
import sys, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score, precision_score

from app import config
from app.storage import cache
import app.features.labels as labels_mod
from app.models.classifier import _build_models

PERSIST_K = 6  # months after t+H that the cut must remain in effect (on average)

def persistent_cut_labels(dividends: pd.Series) -> pd.Series:
    H = config.FORWARD_MONTHS
    rr = labels_mod.run_rate(dividends)
    # forward average of run-rate over [t+H, t+H+K)
    fwd = rr.shift(-H).rolling(PERSIST_K, min_periods=PERSIST_K).mean().shift(-(PERSIST_K - 1))
    label = (fwd < (1.0 - config.CUT_THRESHOLD) * rr).astype(float)
    label[fwd.isna()] = np.nan
    label[rr.fillna(0.0) <= 0.0] = np.nan
    return label

# patch the shared label function so build_features uses the persistent version
labels_mod.cut_labels = persistent_cut_labels

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

def episodes(mask):
    m = mask.astype(int).to_numpy()
    return int(((m == 1) & (np.r_[0, m[:-1]] == 0)).sum())

rows = []
for H in (3, 6, 12):
    config.FORWARD_MONTHS = H
    import app.features.build_features as bf
    importlib.reload(bf)  # rebuild with patched label + new horizon

    # event counts on test window
    n_cutters = ep = pos_m = 0
    for t in eligible:
        lab = persistent_cut_labels(raw[t]["dividends"])
        lab = lab[lab.index.year >= config.TEST_START_YEAR].dropna()
        if lab.sum() > 0:
            n_cutters += 1; ep += episodes(lab == 1); pos_m += int(lab.sum())

    X, y, dates = bf.build_training_panel(train_data)
    years = pd.DatetimeIndex(dates).year
    tr = np.asarray(years <= config.TRAIN_END_YEAR)
    te = np.asarray(years >= config.TEST_START_YEAR)
    Xtr, ytr, Xte, yte = X[tr], y[tr], X[te], y[te]

    primary, baseline = _build_models()
    gb = roc_auc_score(yte, clone(primary).fit(Xtr, ytr).predict_proba(Xte)[:, 1])
    lr = roc_auc_score(yte, clone(baseline).fit(Xtr, ytr).predict_proba(Xte)[:, 1])
    rule = roc_auc_score(yte, (-Xte["payout_trend"]).fillna(0.0))
    clf = TabPFNClassifier(device="cpu", random_state=0, ignore_pretraining_limits=True)
    clf.fit(Xtr.to_numpy(dtype=np.float32), ytr.to_numpy())
    proba = clf.predict_proba(Xte.to_numpy(dtype=np.float32))[:, 1]
    tab = roc_auc_score(yte, proba)
    prec = precision_score(yte, proba >= config.RISKY_MIN, zero_division=0)

    rows.append({"H": H, "cutter_ETFs": f"{n_cutters}/{len(eligible)}", "episodes": ep,
                 "test_pos": int(yte.sum()), "pos_pct": round(100*yte.mean(), 2),
                 "TabPFN": round(tab, 4), "LR": round(lr, 4), "GB": round(gb, 4),
                 "Rule": round(rule, 4), "TabPFN_prec": round(prec, 3)})
    print(f"H={H:2d}  cutters={n_cutters:2d}/{len(eligible)}  ep={ep:2d}  "
          f"pos={int(yte.sum()):3d}({yte.mean()*100:4.1f}%)  "
          f"TabPFN={tab:.4f} LR={lr:.4f} GB={gb:.4f} Rule={rule:.4f}")

print(f"\n=== PERSISTENT cut (sustained {PERSIST_K}m), real data, test>=2022 ===")
print(pd.DataFrame(rows).to_string(index=False))
