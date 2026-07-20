import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { money } from "../lib/format";

const PLAN_COLORS = { Safe: "#34d399", Balanced: "#38bdf8", "High-risk": "#fbbf24" };

export default function FrontierChart({ frontier, plans, incomeGoal }) {
  if (!frontier?.length) return null;
  const goal = Number(incomeGoal) > 0 ? Number(incomeGoal) : null;
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Efficient frontier</h2>
      <p className="mb-3 text-sm text-slate-400">
        <span className="text-slate-300">What this shows:</span> the best monthly income you can get at each
        level of risk. <span className="text-slate-300">How it helps:</span> the curve's steepness tells you
        how much extra income more risk actually buys — where it flattens, extra risk stops paying off.
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={frontier} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="#243352" strokeDasharray="3 3" />
            <XAxis
              dataKey="volatility"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              label={{ value: "Volatility", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              width={56}
            />
            <Tooltip
              contentStyle={{ background: "#16223c", border: "1px solid #243352", borderRadius: 12 }}
              labelFormatter={(v) => `Volatility ${(v * 100).toFixed(1)}%`}
              formatter={(v) => [money(v), "Monthly income"]}
            />
            {goal && (
              <ReferenceLine
                y={goal}
                stroke="#38bdf8"
                strokeDasharray="5 5"
                label={{ value: `Goal ${money(goal)}/mo`, position: "insideTopLeft", fill: "#38bdf8", fontSize: 11 }}
              />
            )}
            <Line type="monotone" dataKey="monthly_income" stroke="#34d399" strokeWidth={2} dot={false} />
            {plans.map((p) => (
              <ReferenceDot
                key={p.name}
                x={p.expected_volatility}
                y={p.monthly_income}
                r={6}
                fill={PLAN_COLORS[p.name] || "#fff"}
                stroke="#0b1220"
                strokeWidth={2}
                ifOverflow="extendDomain"
                label={{ value: p.name, position: "top", fill: PLAN_COLORS[p.name], fontSize: 11 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
