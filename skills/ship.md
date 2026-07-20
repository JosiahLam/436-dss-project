# Skill: ship — branch, commit, and open a PR

**When to use:** any time code changes locally and needs to reach GitHub.

## Context a newcomer needs

Single project folder with the GitHub remote attached (origin =
`https://github.com/JosiahLam/436-dss-project.git`). Merging to `main` auto-deploys
the Vercel frontend and Render backend.

**Never commit or push directly to `main`.** Work happens on a branch and lands via a
pull request, so changes can be reviewed before they hit the live demo.

## Steps, in order

1. Start from an up-to-date branch off `main`:
   ```bash
   git checkout main && git pull --ff-only origin main
   git checkout -b <type>/<short-topic>      # e.g. ux/clarity-pass, fix/cold-start
   ```
   (Already on a working branch? Just keep using it.)
2. Stage and review — confirm only intended files appear:
   ```bash
   git add <paths>          # prefer explicit paths over `git add -A`
   git status --short
   ```
3. Commit with the repo's identity and trailer convention:
   ```bash
   git -c user.name="JosiahLam" -c user.email="mrjosiahlam@gmail.com" \
     commit -m "<short imperative summary>

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```
4. Push the **branch** (never `HEAD:main`):
   ```bash
   git push -u origin HEAD
   ```
5. Open a PR and hand the link over:
   ```bash
   gh pr create --fill --base main
   ```
6. After it merges, verify the deploy — follow `skills/verify-deploy.md`.

## Example of a good final output

```
=== staged ===
M  frontend/src/pages/Recommendation.jsx
A  frontend/src/components/results/RiskMeter.jsx
=== pushing ===
To https://github.com/JosiahLam/436-dss-project.git
 * [new branch]      ux/clarity-pass -> ux/clarity-pass
https://github.com/JosiahLam/436-dss-project/pull/7
```

A new branch pushed and a PR URL to review — no direct write to `main`.

## Mistakes to avoid (each one actually happened)

- **Never push to `main`.** No `git push origin HEAD:main`. Branch + PR, always.
- **Never use `git push -f`.** If a push is rejected, fetch and rebase onto the latest `main`; investigate rather than force.
- **Check `git status --short` before committing.** Hundreds of staged files means something is wrong (a venv or `node_modules` crept in) — abort and fix.
- **Never stage `backend/.venv/`, `node_modules/`, or `backend/perch_data/`.** They're gitignored; if they appear, don't "fix" it by committing them.
- **The deployment URL changes per deploy.** Verify against the production domain, not an old `...-<hash>.vercel.app` link — those die with `DEPLOYMENT_NOT_FOUND`.
- **Never commit secrets** (`.env`, credentials, API keys).
