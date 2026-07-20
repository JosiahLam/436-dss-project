# Skill: run-dev — start the Perch app locally

**When to use:** at the start of any working session, or whenever the dashboard shows connection errors / empty data locally.

## Context a newcomer needs

Perch is two servers:
- **Backend** — FastAPI at `http://localhost:8000`, venv at `backend/.venv`, data in SQLite+Parquet under `backend/perch_data/` (gitignored, may be empty on a fresh clone).
- **Frontend** — Vite/React at `http://localhost:5173`; its dev proxy forwards `/api` → `:8000` (see `frontend/vite.config.js`), so the backend must be up for data to load.

Background servers do NOT survive between sessions — assume both are down until proven otherwise.

## Steps, in order

1. Check whether the backend is already up (don't blindly restart):
   ```bash
   curl -s http://localhost:8000/api/health
   ```
   `{"status":"ok","has_data":true}` → skip to step 4.
2. If `perch_data/` is empty or `has_data` is false, seed it first (fast, deterministic):
   ```bash
   cd "backend"
   ./.venv/bin/python -m scripts.run_pipeline --synthetic
   ```
3. Start the backend (run in background):
   ```bash
   cd "backend"
   ./.venv/bin/python -m uvicorn app.main:app --port 8000 --log-level warning
   ```
4. Start the frontend. Prefer the preview server config (`.claude/launch.json`, name `perch-frontend`); otherwise:
   ```bash
   cd "frontend" && npm run dev
   ```
5. Verify the full chain before declaring success:
   ```bash
   curl -s --retry 8 --retry-delay 1 --retry-connrefused http://localhost:8000/api/health
   curl -s -o /dev/null -w "frontend HTTP %{http_code}\n" http://localhost:5173/
   curl -s http://localhost:5173/api/health   # proxy check
   ```

## Example of a good final output (real run)

```
{"status":"ok","has_data":true}
frontend HTTP 200
proxy /api HTTP 200
universe: 32 funds · source synthetic
```

All three hops green: backend healthy, frontend serving, proxy wired, data present.

## Mistakes to avoid (each one actually happened)

- **Port 5173 conflicts.** A manually-launched `npm run dev` blocks the preview server (error: "Port 5173 is in use by node"). Fix: `lsof -ti:5173 | xargs kill -9`, then start ONE of them — not both.
- **Don't serve an empty database.** Starting uvicorn before ever running the pipeline gives a styled-but-empty dashboard. Seed first (step 2). (The app now self-seeds on startup as a safety net, but don't rely on it locally.)
- **Use the venv's python explicitly** (`./.venv/bin/python -m ...`). Plain `python3` is the system interpreter without the project deps.
- **`timeout <secs> cmd` does not exist on this macOS/zsh.** Use the Bash tool's timeout parameter or `curl --max-time` instead.
- **Don't assume a server you started earlier is still running.** Background processes get killed between sessions — health-check first (step 1), restart only if needed.
