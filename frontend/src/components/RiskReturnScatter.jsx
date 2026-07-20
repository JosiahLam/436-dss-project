import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { pct, CATEGORY_COLORS, CATEGORY_LABELS, riskLabel } from "../lib/format";

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function PointTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-edge bg-panel2 px-3 py-2 text-xs">
      <div className="font-medium text-slate-100">
        {d.ticker.replace(".TO", "")} <span className="text-slate-400">· {d.category_label}</span>
      </div>
      <div className="mt-1 text-slate-300">Income yield {pct(d.y, 1)} · Cut risk {pct(d.x, 0)}</div>
      <div className="text-slate-500">{d.eligible ? `${riskLabel(d.risk)} cut risk` : "screened out"}</div>
    </div>
  );
}

// Risk (cut probability) vs. return (income yield), colored by asset class.
// The dashed cross-hairs are the medians, splitting the funds into quadrants so
// the "more income for less risk" sweet spot (top-left) is obvious at a glance.
export default function RiskReturnScatter({ etfs, onSelect }) {
  const data = etfs
    .filter((e) => e.prob_cut != null && e.dist_yield != null)
    .map((e) => ({
      x: e.prob_cut,
      y: e.dist_yield,
      ticker: e.ticker,
      category: e.category,
      category_label: e.category_label,
      risk: e.risk_category,
      eligible: e.eligible,
    }));

  const mx = median(data.map((d) => d.x));
  const my = median(data.map((d) => d.y));
  const cats = [...new Set(data.map((d) => d.category))];

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Risk vs. return</h2>
      <p className="mb-3 text-sm text-slate-400">
        <span className="text-slate-300">What this shows:</span> each fund's income yield against its cut risk,
        colored by type. <span className="text-slate-300">How it helps:</span> funds in the{" "}
        <span className="text-emerald-300">top-left</span> pay more income for less risk — the best candidates.
        The bottom-right pays little and is likely to cut. Click any fund for detail.
      </p>
      <div className="h-[30rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 18, left: 6 }}>
            <CartesianGrid stroke="#243352" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              label={{ value: "Cut risk  →  (higher = riskier)", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              width={48}
              label={{ value: "Income yield  ↑", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={mx} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine y={my} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Tooltip content={<PointTip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={data} onClick={(d) => d?.ticker && onSelect(d.ticker)} className="cursor-pointer">
              {data.map((d) => (
                <Cell key={d.ticker} fill={CATEGORY_COLORS[d.category] || "#64748b"} fillOpacity={d.eligible ? 0.9 : 0.35} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        {cats.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
            {CATEGORY_LABELS[c] || c}
          </span>
        ))}
        <span className="text-slate-500">· faded = screened out</span>
      </div>
    </section>
  );
}
