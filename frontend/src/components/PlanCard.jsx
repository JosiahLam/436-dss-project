import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { money, pct, PLAN_ACCENT, CATEGORY_COLORS, CATEGORY_LABELS } from "../lib/format";
import RiskBadge from "./RiskBadge";

export default function PlanCard({ plan, onSelectEtf }) {
  const accent = PLAN_ACCENT[plan.name] || "text-slate-200";

  // Allocation by category (for the legend) — slices below are per-fund.
  const invested = plan.holdings.reduce((s, h) => s + h.allocation, 0) || 1;
  const byCat = {};
  plan.holdings.forEach((h) => (byCat[h.category] = (byCat[h.category] || 0) + h.allocation));
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-baseline justify-between">
        <h3 className={`text-lg font-semibold ${accent}`}>{plan.name}</h3>
        <span className="text-xs text-slate-400">{plan.n_holdings} funds</span>
      </div>
      <p className="mt-1 min-h-[2.5rem] text-xs leading-5 text-slate-400 line-clamp-2">{plan.blurb}</p>

      <div className="mt-4">
        <div className="label">Estimated monthly income</div>
        <div className="text-3xl font-semibold text-white">{money(plan.monthly_income)}</div>
        <div className="text-xs text-slate-400">{money(plan.annual_income)} / year</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Portfolio yield" value={pct(plan.portfolio_yield, 2)} />
        <Stat label="Volatility" value={pct(plan.expected_volatility, 1)} />
        <Stat label="Income from Safe" value={pct(plan.income_secured_pct, 0)} />
        <Stat label="Leftover cash" value={money(plan.leftover_cash)} />
      </div>

      {/* Allocation donut: one slice per fund, colored by category */}
      {plan.holdings.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-28 w-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={plan.holdings}
                  dataKey="allocation"
                  nameKey="ticker"
                  innerRadius={30}
                  outerRadius={52}
                  paddingAngle={1}
                  stroke="#0b1220"
                  strokeWidth={1}
                >
                  {plan.holdings.map((h) => (
                    <Cell key={h.ticker} fill={CATEGORY_COLORS[h.category] || "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#16223c", border: "1px solid #243352", borderRadius: 12 }}
                  itemStyle={{ color: "#ffffff" }}
                  labelStyle={{ color: "#ffffff" }}
                  formatter={(v, n, p) => [
                    `${money(v)} · ${pct(p.payload.weight, 0)}`,
                    p.payload.ticker.replace(".TO", ""),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-xs">
            {catRows.map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                <span className="text-slate-300">{CATEGORY_LABELS[cat]}</span>
                <span className="tabular-nums text-slate-500">{pct(amt / invested, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-edge pt-3">
        <div className="label mb-2">Holdings</div>
        <div className="space-y-1.5">
          {plan.holdings.map((h) => (
            <button
              key={h.ticker}
              onClick={() => onSelectEtf(h.ticker)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-panel2"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-slate-100">{h.ticker.replace(".TO", "")}</span>
                <RiskBadge risk={h.risk} />
              </span>
              <span className="flex items-center gap-3 text-slate-300">
                <span className="tabular-nums text-slate-400">{h.shares} sh</span>
                <span className="tabular-nums">{money(h.monthly_income)}/mo</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-panel2 px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 font-medium text-slate-100">{value}</div>
    </div>
  );
}
