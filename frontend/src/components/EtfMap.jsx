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
import { pct, RISK_COLORS } from "../lib/format";

function PointTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-edge bg-panel2 px-3 py-2 text-xs">
      <div className="font-medium text-slate-100">
        {d.ticker.replace(".TO", "")} <span className="text-slate-400">· {d.category_label}</span>
      </div>
      <div className="mt-1 text-slate-300">Yield {pct(d.y, 1)} · Cut prob {pct(d.x, 0)}</div>
      <div style={{ color: RISK_COLORS[d.risk] }}>{d.risk}</div>
    </div>
  );
}

export default function EtfMap({ etfs, onSelect }) {
  const data = etfs
    .filter((e) => e.prob_cut != null && e.dist_yield != null)
    .map((e) => ({
      x: e.prob_cut,
      y: e.dist_yield,
      ticker: e.ticker,
      risk: e.risk_category,
      category_label: e.category_label,
    }));

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">ETF risk map</h2>
      <p className="mb-3 text-sm text-slate-400">
        Distribution yield vs. predicted cut probability. The top-right is the “yield trap” zone —
        tempting payouts the model thinks are likely to be cut. Click a fund for detail.
      </p>
      <div className="h-72">
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
              label={{ value: "Probability of dividend cut", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              width={48}
              label={{ value: "Distribution yield", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={0.25} stroke="#34d399" strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine x={0.55} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Tooltip content={<PointTip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              data={data}
              onClick={(d) => d?.ticker && onSelect(d.ticker)}
              className="cursor-pointer"
            >
              {data.map((d) => (
                <Cell key={d.ticker} fill={RISK_COLORS[d.risk] || "#64748b"} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-400">
        {["Safe", "Watch", "Risky"].map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: RISK_COLORS[r] }} />
            {r}
          </span>
        ))}
      </div>
    </section>
  );
}
