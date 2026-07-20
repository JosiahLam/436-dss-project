const asPct = (v, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v == null ? "—" : v.toFixed(d));

// Plain-language panel summarizing how trustworthy the dividend-cut model is.
// Reads the v2 decision metrics carried on /api/run-info.
export default function ModelPerformance({ runInfo, flaggedCount }) {
  if (!runInfo) return null;

  const av = runInfo.cut_avoidance;
  const hasV2 = av != null && (runInfo.folds ?? 0) > 0;
  const ofTen = av != null ? Math.round(av * 10) : null;
  const budget = runInfo.exclusion_budget;
  const lrBudget = runInfo.lr_exclusion_budget;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">How well the model protects your income</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Before recommending anything, Perch predicts which funds are likely to cut their payout and
        sets the riskiest ones aside. Here's how that call held up when tested on years it had never seen.
      </p>

      {hasV2 ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              label="Cuts caught"
              big={ofTen != null ? `${ofTen} of 10` : "—"}
              exact={`${asPct(av)} of real dividend cuts flagged in advance`}
              sub="2019–24 walk-forward backtest"
              accent="text-emerald-300"
            />
            <Tile
              label="Cost of that protection"
              big={budget != null ? `~${Math.round(budget * 100)}%` : "—"}
              exact="of candidate funds set aside to get there"
              sub={lrBudget != null ? `a simpler model needs ~${Math.round(lrBudget * 100)}%` : null}
              accent="text-sky-300"
            />
            <Tile
              label="Flagged right now"
              big={flaggedCount != null ? String(flaggedCount) : "—"}
              exact={flaggedCount === 1 ? "fund scored Risky today" : "funds scored Risky today"}
              sub="excluded from every plan"
              accent="text-rose-300"
            />
          </div>

          <div className="mt-4 rounded-xl border border-edge bg-panel2 px-4 py-3">
            <div className="label mb-2">Under the hood (for the curious)</div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[12px] leading-5 text-slate-400 sm:grid-cols-2">
              <div>
                <span className="text-slate-200">CatBoost (the model we use)</span> · ROC-AUC{" "}
                {num(runInfo.model_roc)}
                {runInfo.model_roc_std != null && ` ± ${num(runInfo.model_roc_std)}`} · PR-AUC {num(runInfo.model_pr)}
              </div>
              <div>
                <span className="text-slate-200">Logistic regression (simple benchmark)</span> · ROC-AUC{" "}
                {num(runInfo.baseline_roc)} · PR-AUC {num(runInfo.baseline_pr)}
              </div>
            </div>
            <p className="mt-2 text-[11px] italic leading-4 text-slate-500">
              Based on {runInfo.n_events ?? "—"} independent cut events across {runInfo.folds} walk-forward
              folds — treat these as directional, not precise. A higher score means the model separates
              soon-to-cut funds from safe ones better than a coin flip (0.50).
            </p>
          </div>
        </>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Model AUC" big={num(runInfo.model_auc)} sub="primary model, test fold" accent="text-emerald-300" />
          <Tile label="Baseline AUC" big={num(runInfo.baseline_auc)} sub="logistic regression" accent="text-sky-300" />
          <Tile
            label="Flagged today"
            big={flaggedCount != null ? String(flaggedCount) : "—"}
            sub="funds scored Risky"
            accent="text-rose-300"
          />
        </div>
      )}
    </section>
  );
}

function Tile({ label, big, exact, sub, accent }) {
  return (
    <div className="rounded-xl border border-edge bg-panel2 px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${accent || "text-white"}`}>{big}</div>
      {exact && <div className="text-[12px] text-slate-300">{exact}</div>}
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
