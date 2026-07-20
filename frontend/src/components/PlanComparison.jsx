import { money, pct, PLAN_ACCENT } from "../lib/format";

// Side-by-side comparison of the three plans.
// Every number comes straight from the /api/plans response — nothing invented.
export default function PlanComparison({ plans }) {
  if (!plans?.length) return null;

  const rows = [
    { label: "Expected monthly income", get: (p) => money(p.monthly_income) },
    { label: "Expected annual income", get: (p) => money(p.annual_income) },
    { label: "Portfolio yield", get: (p) => pct(p.portfolio_yield) },
    { label: "Expected volatility (ups & downs)", get: (p) => pct(p.expected_volatility) },
    { label: "Income from Safe funds", get: (p) => pct(p.income_secured_pct, 0) },
    { label: "Number of funds held", get: (p) => String(p.n_holdings) },
    { label: "Leftover cash", get: (p) => money(p.leftover_cash) },
  ];

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Compare the three plans</h2>
      <p className="mt-1 text-sm text-slate-400">
        <span className="text-slate-300">What this shows:</span> the same budget invested three ways.{" "}
        <span className="text-slate-300">Why it matters:</span> more income almost always means more volatility —
        this lets you see exactly how much extra income you'd get for accepting more swings, so you can pick the
        trade-off that fits you.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-56 py-2 text-left font-normal text-slate-500"></th>
              {plans.map((p) => (
                <th key={p.name} className={`px-3 py-2 text-left text-base font-semibold ${PLAN_ACCENT[p.name] || "text-white"}`}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-edge/60">
                <td className="py-2 text-slate-400">{r.label}</td>
                {plans.map((p) => (
                  <td key={p.name} className="px-3 py-2 text-slate-100">
                    {r.get(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
