import { useMemo } from "react";
import { pct, CATEGORY_COLORS, CATEGORY_LABELS } from "../lib/format";

const CATS = ["covered_call", "equity_income", "bond", "reit"];

// Perch's universe is grouped by asset class rather than GICS sector — this
// is that grouping's real breakdown: how many funds, their average yield,
// and average cut risk per category, all from live scored data.
export default function CategoryBreakdown({ etfs }) {
  const rows = useMemo(() => {
    return CATS.map((cat) => {
      const list = etfs.filter((e) => e.category === cat && e.eligible);
      const n = list.length || 1;
      const avgYield = list.reduce((s, e) => s + (e.dist_yield || 0), 0) / n;
      const avgCutRisk = list.reduce((s, e) => s + (e.prob_cut || 0), 0) / n;
      return { cat, count: list.length, avgYield, avgCutRisk };
    }).filter((r) => r.count > 0);
  }, [etfs]);

  const maxYield = Math.max(...rows.map((r) => r.avgYield), 0.0001);

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Universe by category</h2>
      <p className="mb-4 mt-1 text-sm text-slate-400">
        <span className="text-slate-300">What this shows:</span> Perch's fund universe grouped by asset
        class (its equivalent of a sector breakdown), with each group's average yield and cut risk.{" "}
        <span className="text-slate-300">Why it matters:</span> which fund impacts my risk mix most starts
        with which category it belongs to.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.cat}>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[r.cat] }} />
                {CATEGORY_LABELS[r.cat]} <span className="text-slate-500">· {r.count} funds</span>
              </span>
              <span className="text-slate-400">
                avg yield {pct(r.avgYield, 1)} · avg cut risk {pct(r.avgCutRisk, 0)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.avgYield / maxYield) * 100}%`, background: CATEGORY_COLORS[r.cat] }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
