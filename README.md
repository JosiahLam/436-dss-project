# 🪺 Perch — Dividend-Income Decision Support System

Click here for Live app: https://436-dss-project-2z8l.vercel.app/

GitHub: https://github.com/JosiahLam/436-dss-project

Perch is a decision support system for beginner investors who want a simple, transparent way to build a dividend-ETF plan. The app combines live market data, a dividend-cut risk model, and a portfolio optimizer to generate three ready-to-review plans instead of presenting a single black-box recommendation.

This project is hosted with Vercel for the frontend and Render for the backend.

---

## What the app does

- Pulls ETF price and dividend data
- Scores each fund for dividend-cut risk
- Filters and ranks funds into Safe / Watch / Risky buckets
- Optimizes a portfolio for monthly income under a risk budget
- Shows three plan options: Safe, Balanced, and High-risk
- Supports optional tax-aware account allocation for TFSA, RRSP, and FHSA

---

## Tech stack

- Backend: Python, FastAPI, pandas, scikit-learn, CatBoost, SciPy, SQLite, Parquet
- Frontend: React 18, Vite, Tailwind CSS, Recharts
- Hosting: Vercel (frontend), Render (backend)

---

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Build the initial scoring snapshot:

```bash
backend/.venv/bin/python -m scripts.run_pipeline --synthetic
```

Start the API:

```bash
backend/.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Open the API docs at:

- http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the app at:

- http://localhost:5173

The frontend dev server proxies API requests to the backend locally.

---

## Project structure

```text
backend/
  app/
    config.py
    main.py
    pipeline.py
    data/
    features/
    models/
    optimize/
    storage/
  scripts/run_pipeline.py
frontend/
  src/
    components/
    pages/
    context/
    lib/
```

---

## API overview

| Method | Path | Purpose |
|---|---|---|
| GET | /api/universe | Get the latest scored ETF universe |
| GET | /api/etf/{ticker} | Get one ETF with features and score details |
| POST | /api/plans | Build three portfolio plans |
| GET | /api/run-info | Get the latest model run metrics |
| POST | /api/refresh?synthetic= | Re-run the scoring pipeline |

---

## Deployment

The frontend is deployed on Vercel and the backend on Render.

- Frontend URL: https://436-dss-project-2z8l.vercel.app/
- Backend URL: https://perch-backend.onrender.com

If you want to deploy your own copy:

1. Deploy the backend on Render using the included render.yaml file.
2. Deploy the frontend on Vercel with the root directory set to frontend.
3. Set the Vite environment variable VITE_API_URL to your Render backend URL.

---

## Notes

- The app includes a deterministic synthetic fallback so it can run even when live market data is unavailable.
- The system is designed as a decision support tool, not investment advice.
- Data should be independently verified before making real investment decisions.
