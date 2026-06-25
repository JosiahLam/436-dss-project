export default function Header({ runInfo, onRefresh, refreshing }) {
  const src = runInfo?.data_source;
  const srcLabel =
    src === "yahoo" ? "Live · Yahoo Finance" : src === "mixed" ? "Mixed data" : "Demo data · synthetic";
  const srcClass =
    src === "yahoo"
      ? "border-emerald-500/40 text-emerald-300"
      : "border-amber-500/40 text-amber-300";

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
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
    </header>
  );
}
