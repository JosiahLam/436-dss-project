# 🪺 Perch — Dividend-Income Decision Support System

> A steady place for your income. Perch helps a beginner investor turn a budget into
> a ready-to-act dividend-ETF plan in seconds — instead of spending hours comparing
> funds and falling for high yields that quietly erode savings.

Perch is a **decision support system (DSS)**, not a black-box recommender. It pulls
live evidence, runs a **predictive** model (will this fund cut its payout?), runs a
**prescriptive** model (what's the best mix under a risk budget?), and hands the
human three transparent, steerable plans. The reasoning is exposed at every step —
the person still makes the call.

---

## The pipeline

```
Yahoo Finance / TMX  →  Screening  →  Dividend-cut classifier  →  Mean-variance  →  Dashboard
   (prices, divs)        (~eligible)     (Safe/Watch/Risky)         optimizer        (3 plans)
```

1. **Ingest** — monthly prices, distributions, and fund attributes per ETF, cached to
   Parquet (Yahoo is rate-limited, so we never re-pull on a user request). Falls back
   to deterministic **synthetic** data when offline so the system always runs.
2. **Screen** (Module 1) — drop leveraged / too-new funds.
3. **Classify** (Module 2) — for each ETF, probability it cuts its *regular*
   distribution within 12 months, bucketed Safe / Watch / Risky.
4. **Optimize** (Module 3) — mean-variance portfolio: maximize monthly income
   (return = distribution yield) under a volatility budget, drop Risky funds, cap
   Watch funds, and keep ≥80% of income in dividend-resilient (Safe) assets.
5. **Dashboard** — live scores, three named plans (Safe / Balanced / High-risk),
   the efficient frontier, and a per-fund drill-down.

The user steers the optimizer with: budget, include/exclude funds, **time horizon**
(shorter horizons cap how aggressive any plan gets), **max weight per fund**
(diversification), and **per-category caps** (e.g. ≤20% covered-call). The universe is
~60 curated Canadian-listed income ETFs across the four categories — a stand-in for the
proposal's TMX-Money universe-discovery step; expand it by editing `config.UNIVERSE`.
The universe was deliberately widened from an initial ~32 funds to ~60 to give the
gradient-boosted classifier (Module 2) more training rows to work with — on the smaller
universe it only marginally beat the logistic-regression baseline (0.72 vs 0.71 AUC),
which is consistent with boosted trees needing more data than a linear model to show
their edge.

## The two models

**Dividend-cut classifier** — gradient boosting (`HistGradientBoostingClassifier`) as
the primary model, with logistic regression as the interpretable baseline. Evaluated
on a **time-based** split (train ≤ 2021, test ≥ 2022) and benchmarked against the dumb
rule "flag any fund whose payout is falling" — the model has to beat that to earn its
keep. Swap in XGBoost/LightGBM by editing `app/models/classifier.py`.

Features (`app/features/build_features.py`): payout trend (24m), payout stability,
ever-cut flag, price trend, distribution yield, expense ratio, fund age, ETF type.
The **label** (`app/features/labels.py`) compares the *smoothed* distribution run-rate
now vs. 12 months ahead, so return-of-capital noise and one-off months don't count as
a cut.

**Portfolio optimizer** (`app/optimize/portfolio.py`) — Markowitz mean-variance via
`scipy.optimize`. Expected return is distribution yield; risk is the annualized
covariance of monthly price returns. Sweeps the efficient frontier and surfaces three
points: Safe (min variance), Balanced (mid), High-risk (max income).

## Tax-advantaged account allocation (asset location)

Holding the same dividend ETFs inside Canada's registered accounts (**TFSA / RRSP /
FHSA**) saves tax on both distributions and future gains. Perch can take the accounts
you hold — and your remaining contribution room — and show *where* to hold each fund in
a suggested plan, with a one-sentence "why" on every placement (it's a DSS, so the
reasoning is exposed). The heuristic (`app/optimize/accounts.py`) is keyed off each
holding's `category` plus a `foreign` flag inferred from the fund name (US / Europe /
International / Global ...), and shelters the most tax-inefficient income first:

| Priority | Category | Tax reason |
|---|---|---|
| 1 (shelter first) | **Bond / fixed income** | Interest is fully taxed as ordinary income at your marginal rate |
| 2 | **REIT** | Distributions are mostly other income / return of capital, no dividend tax credit (TFSA ideal) |
| 3 | **Covered call** | Option-premium income taxed as capital gains + mixed distributions — moderate burden |
| 4 | **Foreign equity income** | No dividend tax credit + (US) withholding tax; prefer RRSP (treaty-exempt) over TFSA/FHSA |
| 5 (keep taxable) | **Canadian equity income** | Eligible dividends get the dividend tax credit — most tax-efficient held non-registered |

Allocation is a transparent greedy fill: sort a plan's holdings most tax-inefficient
first, pour each into your sheltered accounts (respecting each account's dollar room),
and overflow the rest to a non-registered account. A single fund may split across
accounts at the dollar level when room runs out.

Enable it by adding an optional `accounts` object to the **`POST /api/plans`** body:

```jsonc
"accounts": {
  "tfsa_room": 20000,        // null / omit = you don't hold this account
  "rrsp_room": 40000,
  "fhsa_room": null,
  "has_non_registered": true // taxable account available for overflow
}
```

When present, every plan in the response gains an `account_allocation` block: per-account
holdings (`{ticker, name, amount, reason}`), totals, `unsheltered_amount`, a plain-language
`summary`, the `assumptions` relied on, and a disclaimer. Omitting `accounts` returns the
exact same response shape as before. The dashboard exposes this via an **"Accounts you
hold (optional)"** section in the plan builder.

> **Not tax advice.** This is an educational estimate; contribution room is user-provided
> — verify it with CRA My Account. Foreign-withholding and dividend-tax-credit rules are
> simplified.

## Storage

- **Parquet** (`perch_data/prices`, `perch_data/dividends`) — bulky cached time-series.
- **SQLite** (`perch_data/perch.db`) — ETF universe, dated model-score snapshots, and
  per-run metrics. The optimizer reads the latest snapshot; it never re-runs the model.

No user accounts or PII. To deploy for many users, swap SQLite → Postgres with no
architecture change.

---

## Running it

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Score the universe (writes the snapshot the API serves)
python -m scripts.run_pipeline              # live Yahoo Finance
python -m scripts.run_pipeline --synthetic  # offline / deterministic demo

# Serve the API
uvicorn app.main:app --reload --port 8000
```

API: <http://localhost:8000/docs>

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: <http://localhost:5173> (the dev server proxies `/api` to the backend).

> The pipeline also runs from the dashboard's **Re-run pipeline** button and from
> `POST /api/refresh`. In a real deployment, schedule `run_pipeline` monthly
> (APScheduler / cron) — that's the "score monthly, optimize on demand" design.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/universe` | Latest scored ETFs (Safe/Watch/Risky + features) |
| GET | `/api/etf/{ticker}` | One fund: price + run-rate history, features, score |
| POST | `/api/plans` | Build 3 plans `{budget, include, exclude, horizon_months, max_weight, category_caps, accounts?}` (see [account allocation](#tax-advantaged-account-allocation-asset-location)) |
| GET | `/api/run-info` | Latest run's model-quality metrics |
| POST | `/api/refresh?synthetic=` | Re-run the scoring pipeline |

## Project layout

```
backend/
  app/
    config.py            # universe, label/feature params, optimizer constraints
    data/ingest.py       # Yahoo Finance + synthetic fallback
    features/            # labels.py, build_features.py
    models/              # classifier.py (boosting + LR), scoring.py
    optimize/portfolio.py# mean-variance optimizer
    storage/             # cache.py (Parquet), db.py (SQLite)
    pipeline.py          # monthly batch orchestration
    main.py              # FastAPI
  scripts/run_pipeline.py
frontend/
  src/components/        # Header, PlanBuilder, PlanCard, FrontierChart, UniverseTable, EtfDetail
  src/App.jsx
```

---

## Deploying (Vercel + Render)

The backend's scientific stack (scipy alone is ~160 MB) exceeds Vercel's 250 MB
serverless limit, so the backend runs on Render and the frontend on Vercel.

**Backend → Render** (`render.yaml` is included):
1. Render → New → Blueprint → pick this repo (or New → Web Service with Root
   Directory `backend`, build `pip install -r requirements.txt`, start
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, Python 3.12).
2. On first boot the app self-seeds a synthetic snapshot, so the API has data
   immediately. Note the service URL, e.g. `https://perch-backend.onrender.com`.

**Frontend → Vercel:**
1. Project → Settings → General → Root Directory = `frontend`.
2. Project → Settings → Environment Variables → add
   `VITE_API_URL = https://perch-backend.onrender.com` (your Render URL, no
   trailing slash).
3. Redeploy. The dashboard now calls the Render backend. (Locally, `VITE_API_URL`
   is unset and the Vite dev proxy handles `/api`.)

CORS is open (`allow_origins=["*"]`) so the cross-origin calls work out of the box.

---

*Educational prototype — not investment advice. Distributions, return-of-capital, and
fund data should be independently verified before investing.*
