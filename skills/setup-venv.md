# Skill: setup-venv — create/repair the backend Python environment

**When to use:** whenever `backend/.venv/bin/python` is missing or broken — a fresh clone, after a pull that deleted it, or when an import fails (`ModuleNotFoundError: catboost`).

## Context a newcomer needs

The backend needs a virtualenv at `backend/.venv` with the packages in
`backend/requirements.txt` (FastAPI, pandas, numpy, scipy, scikit-learn, **CatBoost**,
yfinance, pyarrow). The venv is **gitignored and never committed** — it is a local
build artifact and must be rebuilt on each machine.

It used to be committed by mistake. PR #5 removed it from tracking, which also
**deleted the working copy** for anyone who pulled — that is exactly the situation
this skill repairs.

## Steps, in order

1. Check whether it's actually broken (don't rebuild unnecessarily):
   ```bash
   cd backend && ./.venv/bin/python -c "import fastapi, catboost, scipy; print('venv OK')"
   ```
   Prints `venv OK` → nothing to do.
2. If that fails, create the venv (safe to run over a broken one):
   ```bash
   cd backend
   python3 -m venv .venv
   ```
3. Install dependencies (takes ~2–4 min; CatBoost/scipy are large):
   ```bash
   ./.venv/bin/pip install -q --upgrade pip
   ./.venv/bin/pip install -q -r requirements.txt
   ```
4. Verify:
   ```bash
   ./.venv/bin/python -c "import fastapi, catboost, scipy, sklearn; print('venv OK')"
   ```
5. Seed data if the database is empty, then start the API — see `skills/run-dev.md`.

## Example of a good final output

```
venv OK
```

Followed by a healthy API:

```
{"status":"ok","has_data":true}
```

## Mistakes to avoid

- **Never commit the venv.** It's in `.gitignore` (`.venv/`, `backend/.venv/`). If `git status` ever shows thousands of `backend/.venv/...` files, something re-added it — do not stage them.
- **Use the venv's interpreter explicitly** (`./.venv/bin/python`, `./.venv/bin/pip`). Bare `python3`/`pip` is the system interpreter and installs to the wrong place.
- **Don't `rm -rf .venv` reflexively.** `python3 -m venv .venv` repairs an existing directory in place; only delete if the rebuild itself fails.
- **A missing `bin/python` with leftover files in `bin/`** is the signature of the PR #5 deletion, not a corrupt install — step 2 fixes it.
- `catboost` is required by the model; if it's missing the API starts but scoring fails.
