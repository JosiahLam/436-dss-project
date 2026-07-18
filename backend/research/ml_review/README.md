# ML Review: why we rebuilt the dividend-cut model

This folder holds the scripts and result data behind the v2 model redesign.
This README explains what we found in plain language — no prior context needed.

## The one-sentence story

The old model looked okay on paper (AUC ~0.72) but that number was an
illusion; when we scored it fairly it was **guessing** (worse than a coin
flip). We fixed the answer key (the label), the questions (the features), the
student (the model), and the exam rules (the evaluation).

---

## The problems we found, in plain words

### 1. The same event was being counted three times ("episode dedup")

The model is asked every month: "will this fund cut within 12 months?" When a
fund does cut, the *three or four months leading into it* all get marked "yes"
— but they are all the same single cut. A model that spots one cut was
scoring three correct answers. It's like counting one rainstorm as three
because you looked out the window three times.

**Fix:** when grading, count each cut once (only its first month).
**Effect:** the old model's honest test score fell from ~0.55 to **0.484 —
below a coin flip**.

### 2. Funds that pay quarterly looked like they were cutting ("phantom cuts")

The old math averaged the last 3 months of payments. A fund that pays every
3 months sometimes had 1 payment inside that window, sometimes 0 — purely
depending on which day the payment landed. When it was 0, the fund looked
like it had slashed its dividend, even though nothing happened.

**Evidence:** quarterly payers were labeled "cut" 2.7x more often than
monthly payers — with no real reason to cut more.
**Fix:** measure payments over a full 12-month window (any payment schedule
fits exactly inside it).

### 3. Many "cuts" weren't really cuts ("churn")

A quarter to half of the labeled cuts bounced back within 6 months — a
temporarily skipped month, not a real reduction. The model was being trained
on an answer key where ~1 in 3 answers was wrong.

**Fix:** the 12-month-window label above. Wrong answers drop from ~27% to
**14%**.

### 4. Labels near the end of the data can't be trusted ("censoring")

To say "this fund cut within 12 months" you need to see 12 months of future.
For dates near the end of our data there IS no 12 months of future — and the
last months of data are also often incomplete. Result: 51% of the test
period's "cuts" were bunched right at the data's edge, most likely artifacts.

**Fix:** don't label dates whose 12-month window runs off the end of the data.

### 5. The model was memorizing funds instead of learning warning signs ("identity leakage")

Some inputs, like a fund's expense ratio, never change — they work like a
name tag. The model learned "name tag X = the fund that cut before" instead
of "these conditions precede a cut." That trick works when the same fund
appears in both the study material and the exam, and fails in real life.

**Evidence:** score with funds mixed across train and test: 0.836. Score when
no fund appears on both sides: 0.653. The 0.18 gap is pure memorization.
**Fix:** remove name-tag inputs; always test on future time periods.

---

## What we changed

| Piece | Before | After |
|---|---|---|
| Label ("what counts as a cut") | 3-month average drops 15% | 12-month total drops 10%, edge dates excluded |
| Features ("what the model sees") | mostly payout trends | market distress signals: unusually high yield, price drawdown, volatility |
| Model | HistGradientBoosting | **CatBoost** (a boosting variant built for small, noisy datasets) |
| Evaluation | one train/test split, monthly rows | 6 rolling year-by-year splits, one score per cut event |
| Reported metric | abstract AUC | **decision metrics**: "exclude the riskiest 25% of funds → avoid ~6 of 10 future cuts" |

Why CatBoost: it beat the old model in **all 6** test years (avg ROC 0.710 vs
0.628) and was 2.5x more consistent year to year. Reaching 60% cut-avoidance
costs ~24% of the fund universe with CatBoost vs ~37% with logistic
regression.

Honest caveats: the whole history contains only **~31 independent cut
events**, so every number here has a wide uncertainty band; the excluded list
is a safety screen, not a verdict (most excluded funds won't actually cut);
and macro features (interest rates etc.) were tested and did NOT help — too
few market regimes in 15 years of data.

---

## Files

Scripts (frozen copies of the study code — they read the cached parquet under
`backend/perch_data`; production code ports this logic and does not import it):

- `label_v2.py` — the new label definition
- `features_v2.py` — the 20 model inputs
- `bakeoff.py` — the 7-model comparison under the fair evaluation
- `run_experiments.py` — the exclusion-budget curve + macro-feature test

Result data (what the tables in the slides come from):

- `label_grid.csv` — 16 label variants compared (threshold × horizon × smoothing)
- `split_stability.csv` — proof that a single train/test split is unreliable
- `results_bakeoff.csv`, `results_bakeoff_agg.csv` — 7 models × 6 test years
- `recall_curve.csv`, `recall_curve_histgb.csv` — "exclude top k% → avoid X% of cuts" curves
- `macro_ablation.csv` — the macro-feature test (rejected: hurt 4 of 6 years)

## Addendum: do we really need 20 features?

We re-ran the fair evaluation dropping one feature group at a time
(`feat_ablation.py`, `feature_ablation.csv`). Removing ANY group hurts
(ROC 0.71 → 0.61–0.68), and shrinking back to the 8 strongest features
falls to 0.624 — the old model's level. Individually weak inputs combine
through tree interactions, so the 20-feature set earns its keep. The most
expendable group is the 4 category flags (−0.027 when dropped).
