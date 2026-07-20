import { useMemo, useState } from "react";
import { pct, riskLabel } from "../lib/format";

// Min-max normalize a list of numbers to [0,1]; missing values map to the
// series median so they don't skew the range.
function normalize(values) {
  const nums = values.filter((v) => v != null);
  if (!nums.length) return () => 0.5;
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const median = [...nums].sort((a, b) => a - b)[Math.floor(nums.length / 2)];
  return (v) => (v == null ? (median - min) / span : (v - min) / span);
}

// Composite dividend-quality score (0-100) from real, already-scored fields —
// not a separate model. Rewards steady, well-covered yield over a headline
// number that's likely to be cut.
function scoreEtfs(etfs) {
  const eligible = etfs.filter((e) => e.eligible && e.dist_yield != null);
  const yieldN = normalize(eligible.map((e) => e.dist_yield));
  const trendN = normalize(eligible.map((e) => e.payout_trend));
  const stabilityN = normalize(eligible.map((e) => e.payout_stability)); // higher CV = less stable
  const cutN = normalize(eligible.map((e) => e.prob_cut));

  return eligible
    .map((e) => {
      const yieldScore = yieldN(e.dist_yield);
      const trendScore = trendN(e.payout_trend);
      const stabilityScore = 1 - stabilityN(e.payout_stability);
      const cutScore = 1 - cutN(e.prob_cut);
      const everCutPenalty = e.ever_cut ? 0.08 : 0;
      const raw = yieldScore * 0.3 + trendScore * 0.2 + stabilityScore * 0.2 + cutScore * 0.3 - everCutPenalty;
      return { ...e, dividendScore: Math.round(Math.max(0, Math.min(1, raw)) * 100) };
    })
    .sort((a, b) => b.dividendScore - a.dividendScore);
}

export default function DividendScore({ etfs, onSelect }) {
  const [count, setCount] = useState(10);
  const ranked = useMemo(() => scoreEtfs(etfs), [etfs]);
  const shown = ranked.slice(0, count);

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Dividend quality leaderboard</h2>
      <p className="mb-4 mt-1 text-sm text-slate-400">
        <span className="text-slate-300">What this shows:</span> a single 0–100 quality score that blends
        yield, payout trend, stability, and cut risk into one ranking — so you can skim the best all-round
        income picks without filtering the table above yourself.{" "}
        <span className="text-slate-300">Why it matters:</span> the highest yield is often the most likely to
        be cut; this surfaces income that's actually built to last.
      </p>
      <div className="space-y-1.5">
        {shown.map((e, i) => (
          <button
            key={e.ticker}
            onClick={() => onSelect(e.ticker)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel2"
          >
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-500">{i + 1}</span>
            <span className="w-16 shrink-0 font-medium text-slate-100">{e.ticker.replace(".TO", "")}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${e.dividendScore}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">{e.dividendScore}</span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-300">{pct(e.dist_yield, 1)}</span>
            <span className="hidden w-16 shrink-0 text-right text-[11px] text-slate-500 sm:inline">{riskLabel(e.risk_category)} risk</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        {count < ranked.length && (
          <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setCount((c) => Math.min(c + 15, ranked.length))}>
            Show more ({ranked.length - count} remaining)
          </button>
        )}
        {count > 10 && (
          <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setCount(10)}>
            Show less
          </button>
        )}
      </div>
    </section>
  );
}
