# ML redesign v2 — research artifacts

Frozen, reproducibility copies of the scripts and result tables behind the
**label v2 / features v2 / CatBoost** redesign that now ships in
`backend/app`. These are a provenance record of *how the locked decisions were
reached*; the production code ports the logic (it does not import from here, and
nothing in `app/` depends on this directory).

The scripts import `app.config` / `app.storage.cache` **only to read the cached
parquet** and reuse each other within this folder. They reflect the codebase at
study time; the headline numbers they produced are captured in the CSVs beside
them and are reproduced by the production `classifier.evaluate()` on the same
cached universe (CatBoost ROC-AUC 0.71, PR-AUC 0.13; LogReg ROC-AUC 0.63,
PR-AUC 0.19; cut-avoidance 0.61 at a 25% exclusion budget).

## Scripts

| File | What it is |
|------|-----------|
| `label_v2.py` | Frequency-robust, censoring-aware cut label. Run-rate = trailing-12-month (TTM) distribution **sum** (invariant to payment cadence); cut(t) = forward TTM < (1−thr)·TTM(t); right-censor guard drops rows whose forward point lands within 2 months of the panel end. Chosen spec: TTM, thr=0.10, fwd=12. |
| `features_v2.py` | Strictly backward-looking features from prices + dividends only. TTM payout trends (6/12/24m), run-rate drawdown, consecutive decline months, payout volatility, 6/12m returns, 12m vol, price drawdown, TTM yield, own-history yield z-score, cross-sectional yield-vs-category, ever_cut, months-since-cut, log age, category one-hots. **No expense_ratio** (identity leak). |
| `bakeoff.py` | The honest walk-forward, episode-deduplicated model bake-off + label/feature/model ablation. Walk-forward by year (train_end 2018..2023, one-year embargo); eval on year+1 with episode-onset positives + stride-6 negatives. |
| `run_experiments.py` | E1 exclusion-budget vs cut-avoidance curve (CatBoost / LogReg / DumbRule) and E2 internal macro-proxy ablation. Reuses `bakeoff.py` wholesale. |

## Result tables

| File | What it shows |
|------|--------------|
| `label_grid.csv` | Label-parameter sweep (threshold × forward × run-rate window): labelled rows, positives, prevalence, episode count, mean run length, **churn fraction** (share of positive rows whose cut reverses within 6m). thr=0.10/fwd=12 keeps prevalence workable (~0.12) with the lowest churn (~0.25). |
| `split_stability.csv` | Per-fold train/test sizes and AUC / PR-AUC across walk-forward splits for HistGB, LogReg, and the dumb rule — the folds are small and noisy, motivating episode-dedup + reporting ± std. |
| `results_bakeoff.csv`, `results_bakeoff_agg.csv` | Full model bake-off, per-fold and aggregated. CatBoost wins ROC-AUC (0.710) and prec@10% and is competitive on PR-AUC; LogReg has the highest raw PR-AUC but worse ranking of the true episodes. |
| `recall_curve.csv` | E1 exclusion-budget → cut-avoidance (recall) curve for CatBoost / LogReg / DumbRule. CatBoost catches ~61% of cut episodes at a 25% budget; LogReg needs ~37% for the same 60% avoidance; the dumb "payout falling" rule barely beats random. |
| `recall_curve_histgb.csv` | Same E1 curve for HistGB, kept to show the tree-baseline it was dropped in favour of. |
| `macro_ablation.csv` | E2: adding internal macro proxies (rate proxy, credit spread, breadth stress) to the feature set. Per-fold PR/ROC deltas are noisy and net ~zero, so **macro features were rejected** — they add complexity without lift on this universe. |

## Headline findings

1. **Episode-dedup honesty.** Raw month-level metrics overstate skill because a
   single multi-month cut episode contributes many correlated positive rows.
   Collapsing each episode to its onset (plus stride-6 negatives) yields a small
   number of *independent* events (~31 across folds) and much wider, more honest
   confidence bands — hence "treat as directional."
2. **CatBoost selection.** Across the bake-off CatBoost gave the best episode
   ranking (ROC-AUC 0.71, top prec@10%) and the best cut-avoidance-per-exclusion
   curve, while handling NaN features natively. It became the primary model;
   LogReg is retained as an interpretable baseline.
3. **Macro rejection.** Internal macro proxies added no reliable lift (E2 deltas
   ≈ 0, high fold-to-fold variance), so the production feature set stays purely
   fund-level and backward-looking.
