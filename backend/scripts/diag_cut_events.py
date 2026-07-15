"""How many ETFs actually cut, at h=3 vs h=12, in the test window (>=2022)?

Distinguishes:
  - positive ETF-months (the row count the AUC is computed over), from
  - distinct ETFs that had >=1 cut, from
  - distinct cut *episodes* (consecutive positive months collapsed).
Also restates the cut definition explicitly.
"""
import sys, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from app import config
from app.storage import cache

print(f"CUT DEFINITION: run-rate falls by > {config.CUT_THRESHOLD:.0%} "
      f"(run-rate = trailing {config.RUNRATE_WINDOW}-month mean of monthly distributions)")
print(f"label(t) = 1 if run_rate(t+H) < {1-config.CUT_THRESHOLD:.2f} * run_rate(t)\n")

raw = {}
for t in config.TICKERS:
    p = cache.read_prices(t)
    if p is None or p.empty:
        continue
    d = cache.read_dividends(t)
    raw[t] = {"prices": p, "dividends": d if d is not None else p * 0.0}
eligible = [t for t in raw
            if t not in config.LEVERAGED_TICKERS
            and len(raw[t]["prices"]) >= config.MIN_AGE_MONTHS]

import app.features.labels as labels_mod

def episodes(mask: pd.Series) -> int:
    """Count runs of consecutive True as single episodes."""
    m = mask.astype(int).to_numpy()
    return int(((m == 1) & (np.r_[0, m[:-1]] == 0)).sum())

for H in (3, 12):
    config.FORWARD_MONTHS = H
    importlib.reload(labels_mod)
    pos_months = 0
    cutter_etfs = []
    total_episodes = 0
    for t in eligible:
        divs = raw[t]["dividends"]
        lab = labels_mod.cut_labels(divs)
        lab = lab[lab.index.year >= config.TEST_START_YEAR]  # test window only
        lab = lab.dropna()
        if lab.sum() > 0:
            n_ep = episodes(lab == 1)
            cutter_etfs.append((t, int(lab.sum()), n_ep))
            pos_months += int(lab.sum())
            total_episodes += n_ep
    print(f"--- H={H} months (test window >=2022) ---")
    print(f"positive ETF-months (AUC rows): {pos_months}")
    print(f"distinct ETFs with >=1 cut    : {len(cutter_etfs)} / {len(eligible)} eligible")
    print(f"distinct cut episodes         : {total_episodes}")
    print("ETFs that cut (ticker, pos_months, episodes):")
    for t, pm, ep in sorted(cutter_etfs, key=lambda x: -x[1]):
        print(f"    {t:10s} months={pm:2d} episodes={ep}")
    print()
