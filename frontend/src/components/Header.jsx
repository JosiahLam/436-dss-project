import { useState } from "react";

const asPct = (v, digits = 0) => (v == null ? null : `${(v * 100).toFixed(digits)}%`);

export default function Header({ runInfo, flaggedCount, onRefresh, refreshing }) {
  const [showInfo, setShowInfo] = useState(false);

  const src = runInfo?.data_source;
  const srcLabel =
    src === "yahoo" ? "Live · Yahoo Finance" : src === "mixed" ? "Mixed data" : "Demo data · synthetic";
  const srcClass =
    src === "yahoo"
      ? "border-emerald-500/40 text-emerald-300"
      : "border-amber-500/40 text-amber-300";

  // v2 decision metrics present? (old snapshots won't have them.)
  const av = runInfo?.cut_avoidance;
  const hasDecision = av != null && (runInfo?.folds ?? 0) > 0;

  const budget = runInfo?.exclusion_budget;
  const lrBudget = runInfo?.lr_exclusion_budget;
  const ofTen = av != null ? Math.round(av * 10) : null;

  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/15 text-2xl">🪺</div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Perch</h1>
            <p className="text-sm text-slate-400">
              A steady place for your income — dividend-ETF decision support.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {src && <span className={`rounded-full border px-3 py-1 ${srcClass}`}>{srcLabel}</span>}
          {runInfo?.run_date && <span className="text-slate-400">Scored {runInfo.run_date}</span>}
          <button className="btn-ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Re-scoring…" : "Re-run pipeline"}
          </button>
        </div>
      </div>

      {hasDecision ? (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <div className="label">How well it protects income</div>
            <button
              type="button"
              aria-label="Model performance details"
              aria-expanded={showInfo}
              onClick={() => setShowInfo((v) => !v)}
              className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none transition-colors ${
                showInfo
                  ? "border-slate-400 text-slate-200"
                  : "border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300"
              }`}
            >
              i
            </button>
          </div>

          {showInfo && (
            <div className="mb-3 rounded-xl border border-edge bg-panel2 px-4 py-3">
              <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[11px] leading-5 text-slate-400 sm:grid-cols-2">
                <div>
                  <span className="text-slate-300">CatBoost (primary)</span> · ROC-AUC{" "}
                  {runInfo.model_roc?.toFixed(2) ?? "—"}
                  {runInfo.model_roc_std != null && ` ± ${runInfo.model_roc_std.toFixed(2)}`} · PR-AUC{" "}
                  {runInfo.model_pr?.toFixed(2) ?? "—"}
                </div>
                <div>
                  <span className="text-slate-300">Logistic (baseline)</span> · ROC-AUC{" "}
                  {runInfo.baseline_roc?.toFixed(2) ?? "—"} · PR-AUC{" "}
                  {runInfo.baseline_pr?.toFixed(2) ?? "—"}
                </div>
              </div>
              <p className="mt-2 text-[11px] italic leading-4 text-slate-500">
                Based on {runInfo.n_events ?? "—"} independent cut events across {runInfo.folds}{" "}
                walk-forward folds — treat as directional, not precise.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DecisionTile
              label="Cuts avoided"
              big={ofTen != null ? `${ofTen} of 10` : "—"}
              exact={av != null ? `${asPct(av)} of real cuts caught` : null}
              sub="2019–24 walk-forward backtest"
            />
            <DecisionTile
              label="Cost of protection"
              big={budget != null ? `~${Math.round(budget * 100)}%` : "—"}
              exact="of candidates set aside"
              sub={
                lrBudget != null
                  ? `simpler model needs ~${Math.round(lrBudget * 100)}%`
                  : "for the target protection level"
              }
            />
            <DecisionTile
              label="Flagged today"
              big={flaggedCount != null ? String(flaggedCount) : "—"}
              exact={flaggedCount === 1 ? "fund scored Risky" : "funds scored Risky"}
              sub="likely to cut — excluded from plans"
            />
          </div>
        </div>
      ) : (
        // Old snapshot without v2 metrics: fall back to the legacy AUC tiles.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DecisionTile label="Model AUC" big={runInfo?.model_auc?.toFixed(2) ?? "—"} sub="primary model, test fold" />
          <DecisionTile label="Baseline AUC" big={runInfo?.baseline_auc?.toFixed(2) ?? "—"} sub="logistic regression" />
          <DecisionTile label="Rule AUC" big={runInfo?.rule_auc?.toFixed(2) ?? "—"} sub="“payout falling” benchmark" />
          <DecisionTile
            label="Flagged today"
            big={flaggedCount != null ? String(flaggedCount) : "—"}
            sub="funds scored Risky"
          />
        </div>
      )}
    </header>
  );
}

function DecisionTile({ label, big, exact, sub }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-white">{big}</div>
      {exact && <div className="text-[12px] text-slate-300">{exact}</div>}
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
