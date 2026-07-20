import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { money, PLAN_ACCENT } from "../../lib/format";

const ACCENT_HEX = { Safe: "#34d399", Balanced: "#38bdf8", "High-risk": "#fbbf24" };

// Projected value over time for the selected plan.
// Deliberately simple and clearly labelled: payouts held flat, prices flat.
// "Reinvested" compounds the distributions; "income taken" keeps principal flat.
export default function WealthProjection({ plan }) {
  const [years, setYears] = useState(10);
  const accent = ACCENT_HEX[plan.name] || "#34d399";

  const data = useMemo(() => {
    const months = years * 12;
    const rate = (plan.portfolio_yield || 0) / 12;
    const out = [];
    let reinvested = plan.invested;
    for (let m = 0; m <= months; m++) {
      if (m > 0) reinvested *= 1 + rate;
      if (m % 6 === 0 || m === months) {
        out.push({
          year: +(m / 12).toFixed(1),
          reinvested: Math.round(reinvested),
          taken: Math.round(plan.invested + plan.monthly_income * m),
        });
      }
    }
    return out;
  }, [plan, years]);

  const end = data[data.length - 1] || { reinvested: 0, taken: 0 };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            If you held the <span className={PLAN_ACCENT[plan.name]}>{plan.name}</span> plan
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Drag the timeline to see how the same {money(plan.invested)} could grow.
          </p>
        </div>
        <div className="flex items-baseline gap-6">
          <Readout label="Reinvesting payouts" value={end.reinvested} color={accent} />
          <Readout label="Taking income as cash" value={end.taken} color="#94a3b8" />
        </div>
      </div>

      {/* timeline slider */}
      <div className="mt-5 flex items-center gap-4">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">Horizon</span>
        <input
          type="range"
          min="1"
          max="30"
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-brand"
        />
        <motion.span
          key={years}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-16 text-right text-sm font-medium tabular-nums text-white"
        >
          {years} yr{years > 1 ? "s" : ""}
        </motion.span>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="gReinv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#243352" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}y`}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              width={62}
              tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
            />
            <Tooltip
              contentStyle={{ background: "#16223c", border: "1px solid #243352", borderRadius: 12 }}
              itemStyle={{ color: "#ffffff" }}
              labelStyle={{ color: "#ffffff" }}
              labelFormatter={(v) => `Year ${v}`}
              formatter={(v, n) => [money(v), n === "reinvested" ? "Reinvesting payouts" : "Taking income"]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} formatter={(v) => (v === "reinvested" ? "Reinvesting payouts" : "Taking income as cash")} />
            <Area type="monotone" dataKey="reinvested" stroke={accent} strokeWidth={2} fill="url(#gReinv)" animationDuration={900} />
            <Area type="monotone" dataKey="taken" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" fill="none" animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        A simple illustration, not a forecast: it assumes payouts stay flat and fund prices don't move.
        Real markets do neither. Not investment advice.
      </p>
    </section>
  );
}

function Readout({ label, value, color }) {
  return (
    <div className="text-right">
      <motion.div key={value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-semibold tabular-nums" style={{ color }}>
        {money(value)}
      </motion.div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
