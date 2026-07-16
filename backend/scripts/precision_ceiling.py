"""Why does a 0.75 AUC give ~0.17 precision? Quantify the base-rate ceiling.

Uses the same test-fold GB probabilities as the pipeline, then shows the
precision-recall tradeoff, precision@top-k, and the AUC that WOULD be needed to
reach 0.5 precision at this base rate.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import roc_auc_score, average_precision_score

from app import config
from app.data import ingest
from app.features import build_features
from app.models.classifier import _build_models
from app.storage import cache

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
eligible = [t for t in data if t not in config.LEVERAGED_TICKERS
            and (data[t]["attrs"].get("age_months") or len(data[t]["prices"])) >= config.MIN_AGE_MONTHS]
X, y, dates = build_features.build_training_panel({t: data[t] for t in eligible})
yr = pd.DatetimeIndex(dates).year
tr, te = np.asarray(yr <= config.TRAIN_END_YEAR), np.asarray(yr >= config.TEST_START_YEAR)
gb, _ = _build_models()
p_te = clone(gb).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
y_te = y[te].to_numpy().astype(int)

base = y_te.mean()
auc = roc_auc_score(y_te, p_te)
ap = average_precision_score(y_te, p_te)
print(f"base rate = {base*100:.2f}%   AUC = {auc:.3f}   avg precision (area under PR) = {ap:.3f}")
print(f"(random-guess precision at any threshold = base rate = {base*100:.1f}%)\n")

order = np.argsort(-p_te)
print("precision@top-k  (flag the k highest-prob ETF-months):")
for k in (10, 20, 40, 80, 120):
    sel = order[:k]
    prec = y_te[sel].mean()
    print(f"  top {k:3d}: precision {prec:.3f}  ({int(y_te[sel].sum())}/{k})  = {prec/base:.1f}x base rate")

# precision at target recalls
print("\nprecision at fixed recall:")
P = int(y_te.sum())
for rec in (0.1, 0.2, 0.3, 0.4):
    need = int(np.ceil(rec * P))
    # smallest k that captures `need` positives
    cum = np.cumsum(y_te[order])
    k = int(np.searchsorted(cum, need) + 1)
    prec = y_te[order[:k]].mean()
    print(f"  recall {rec:.0%} (catch {need}/{P}): flag {k} -> precision {prec:.3f}")

# what AUC would be needed for precision 0.5 at this base rate (bi-normal approx)
from scipy.stats import norm
def prec_at(auc_val, tpr):
    d = np.sqrt(2) * norm.ppf(auc_val)          # bi-normal separation
    fpr = norm.cdf(norm.ppf(tpr) - d)
    return tpr * base / (tpr * base + fpr * (1 - base))
print("\nprecision achievable at recall=0.2, by AUC (bi-normal approx):")
for a in (0.75, 0.80, 0.85, 0.90, 0.95):
    print(f"  AUC {a:.2f} -> precision {prec_at(a, 0.2):.3f}")
