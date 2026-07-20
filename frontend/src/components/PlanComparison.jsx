import { money, pct, PLAN_ACCENT } from "../lib/format";

// Side-by-side comparison of the three plans + auto-derived pros/cons.
// Every number comes straight from the /api/plans response — nothing invented.
export default function PlanComparison({ plans, incomeGoal }) {
  if (!plans?.length) return null;

  const goal = Number(incomeGoal) > 0 ? Number(incomeGoal) : null;

  const maxIncome = Math.max(...plans.map((p) => p.monthly_income));
  const minIncome = Math.min(...plans.map((p) => p.monthly_income));
  const maxVol = Math.max(...plans.map((p) => p.expected_volatility));
  const minVol = Math.min(...plans.map((p) => p.expected_volatility));
  const maxSecured = Math.max(...plans.map((p) => p.income_secured_pct));
  const minSecured = Math.min(...plans.map((p) => p.income_secured_pct));

  const rows = [
    { label: "Expected monthly income", get: (p) => money(p.monthly_income), best: (p) => p.monthly_income === maxIncome },
    { label: "Expected annual income", get: (p) => money(p.annual_income) },
    { label: "Portfolio yield", get: (p) => pct(p.portfolio_yield) },
    { label: "Expected volatility (ups & downs)", get: (p) => pct(p.expected_volatility), best: (p) => p.expected_volatility === minVol, lowerIsBetter: true },
    { label: "Income from Safe funds", get: (p) => pct(p.income_secured_pct, 0), best: (p) => p.income_secured_pct === maxSecured },
    { label: "Number of funds held", get: (p) => String(p.n_holdings) },
    { label: "Leftover cash", get: (p) => money(p.leftover_cash) },
  ];

  const prosCons = (p) => {
    const pros = [];
    const cons = [];
    if (p.monthly_income === maxIncome) pros.push(`Highest income — ${money(p.monthly_income)}/mo`);
    if (p.expected_volatility === minVol) pros.push("Steadiest — lowest volatility");
    if (p.income_secured_pct === maxSecured) pros.push(`${pct(p.income_secured_pct, 0)} of income from Safe funds`);
    if (goal && p.monthly_income >= goal) pros.push(`Meets your ${money(goal)}/mo goal`);
    if (p.monthly_income === minIncome) cons.push("Lowest income of the three");
    if (p.expected_volatility === maxVol) cons.push("Most ups and downs");
    if (p.income_secured_pct === minSecured) cons.push("Leans more on Watch funds for income");
    if (goal && p.monthly_income < goal) cons.push(`Falls ${money(goal - p.monthly_income)}/mo short of your goal`);
    return { pros, cons };
  };

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
                {plans.map((p) => {
                  const isBest = r.best?.(p);
                  return (
                    <td key={p.name} className="px-3 py-2">
                      <span className={isBest ? "font-semibold text-emerald-300" : "text-slate-100"}>
                        {r.get(p)}
                        {isBest && <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-400/70">best</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const { pros, cons } = prosCons(p);
          return (
            <div key={p.name} className="rounded-xl border border-edge bg-panel2 p-4">
              <div className={`text-sm font-semibold ${PLAN_ACCENT[p.name] || "text-white"}`}>{p.name}</div>
              <p className="mt-1 text-[12px] leading-5 text-slate-400">{p.blurb}</p>
              <ul className="mt-2 space-y-1 text-[12px]">
                {pros.map((t) => (
                  <li key={t} className="flex gap-1.5 text-emerald-300">
                    <span>+</span>
                    <span className="text-slate-300">{t}</span>
                  </li>
                ))}
                {cons.map((t) => (
                  <li key={t} className="flex gap-1.5 text-rose-300">
                    <span>−</span>
                    <span className="text-slate-300">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
