# How Josiah works — read this before doing anything

Josiah (GitHub `JosiahLam`, mrjosiahlam@gmail.com) is a university student building
**Perch**, a dividend-ETF decision support system, as a course project (Group 7 IDSS).
Deliverables go to three audiences: the live demo app, course forms/write-ups, and
graders clicking a Vercel link. He often dictates prompts by voice — expect typos
("prodotype", "dividen"); interpret intent, never nitpick.

## Stack and tools (do not substitute)

- **Backend:** Python + FastAPI · scikit-learn + **CatBoost** for classification ·
  scipy SLSQP for mean-variance optimization · pandas · SQLite + Parquet storage ·
  yfinance data (auto-falls back to synthetic when blocked).
  Always use the project venv: `backend/.venv/bin/python`, never bare `python3`.
- **Frontend:** React 18 + Vite · Tailwind (custom dark theme — tokens `ink`, `panel`,
  `panel2`, `edge`, `brand` in `frontend/tailwind.config.js`) · Recharts for all charts.
- **Hosting:** Vercel = frontend only (Root Directory `frontend`, env `VITE_API_URL`,
  prod URL `https://436-dss-project-2z8l.vercel.app`). Render free tier = backend
  (`https://perch-backend.onrender.com`, sleeps after ~15 min idle). Backend can NEVER
  move to Vercel serverless: scipy+numpy exceed the 250 MB limit (measured).
- **Machine:** macOS, zsh. `timeout` does not exist; use `curl --max-time`.

## The one rule that prevents disasters

Single project folder with the GitHub remote attached. When code changes:
1. Edit here, test locally.
2. **Branch, then open a PR — never commit or push to `main` directly.** See `skills/ship.md`.

`backend/.venv` is **gitignored and never committed** — it's a local build artifact.
If it's missing or broken, rebuild it with `skills/setup-venv.md` (this happens after
pulling the commit that untracked it).

## Tone and writing rules (learned from his corrections)

1. **Short and simple beats thorough.** He asked twice to shrink my drafts. Default to
   the concise version; offer the longer one only if asked.
2. Plain words, no finance/ML jargon in anything user-facing: "funds likely to cut
   payouts," not "distribution-reduction probability estimates."
3. Course write-ups: team voice ("we"), exactly the asked-for length (usually 1
   paragraph), paste-ready — he submits them unedited.
4. Lists: ≤8 bullets, bold lead-in, one line each. Warnings: one line, emoji fine (⚠️).
5. Answer his actual question first, directly; context after. When a decision is his,
   give 2–4 concrete options with one recommendation — he almost always takes it.
6. App UI copy is friendly and always carries "not investment advice."

**Sample of the target register** (an accepted deliverable):
> Perch is a decision support system that helps beginner investors build a
> dividend-ETF portfolio for steady monthly income. It predicts which ETFs are likely
> to cut their dividend, drops the risky ones, and builds three ready-to-invest plans
> — turning hours of research into an instant, transparent plan.

## Recurring tasks → skill files (in `skills/`)

| When | Task | Skill file |
|---|---|---|
| Every session start | Start backend + frontend locally, seed DB if empty | `skills/run-dev.md` |
| Venv missing/broken (fresh clone, after PR #5) | Rebuild `backend/.venv` | `skills/setup-venv.md` |
| Every code change (3–5×/wk) | Branch, commit, open a PR (never push to main) | `skills/ship.md` |
| After every push | Smoke-test live site (health, universe, plans, bundle-wiring) | `skills/verify-deploy.md` |
| Monthly / pre-demo / after model edits | Re-run scoring pipeline, sanity-check buckets + AUC | `skills/rescore-model.md` |
| Before demos (or once, permanently) | Kill the Render cold-start wait | `skills/keep-warm.md` |

## What a good day's output looks like (a real one, 2026-06-25)

Josiah sent three casual UI requests (white tooltip text, confirmation popups, ✕
buttons). Good execution meant, in order:

1. **Edited exactly 3 files** (`App.jsx`, `EtfDetail.jsx`, `PlanCard.jsx`) — minimal
   diff, matching the existing Tailwind tokens.
2. **Verified in the running app, with proof**: tooltip color measured as
   `rgb(255, 255, 255)`, toast text found in DOM, no "Close" string remaining, zero
   console errors. Claims are backed by command output, not assertion.
3. **One commit, imperative summary** — `UI: white pie-chart tooltip, confirmation
   toasts, X close buttons` — pushed as a fast-forward.
4. **Live site smoke-tested green** and reported in a short table/summary he can skim,
   ending with 1–2 concrete next-step options.

The bar: code runs and is verified end-to-end before "done" is said; write-ups need
zero edits; anything broken or skipped is reported plainly (e.g., "Yahoo is blocked
here, so this run used the synthetic fallback — it's badged in the UI").

## Environment quirks (verified, will bite you)

- yfinance is network-blocked in this sandbox → pipeline falls back to synthetic data
  and prints per-ticker "possibly delisted" spam. That's the fallback **working**.
- Background servers die between sessions — health-check `:8000` and `:5173` first.
- Port 5173: don't run a manual `npm run dev` alongside the preview server.
- Render cold start = 20–55 s on first request; it's not an outage.
- `backend/.venv` is gitignored. Pulling the commit that untracked it DELETES the local
  copy — rebuild via `skills/setup-venv.md`, don't re-commit it.
- Framer Motion needs `requestAnimationFrame`; in a hidden/background tab rAF is
  throttled, so anything starting at `opacity: 0` would never appear. Reveals fall back
  to their final state (`lib/ioSupport.js`) — keep that guard on new animations.
