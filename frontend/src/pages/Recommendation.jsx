import { Link } from "react-router-dom";
import { usePerch } from "../context/PerchContext";
import PlanCard from "../components/PlanCard";
import PlanComparison from "../components/PlanComparison";
import FrontierChart from "../components/FrontierChart";
import { money, PLAN_ACCENT } from "../lib/format";

export default function Recommendation() {
  const {
    plans, planInputs, incomeGoal, hasData, optimizing, openEtf,
    savedScenario, saveScenario, clearScenario,
  } = usePerch();

  if (!hasData || (optimizing && !plans)) {
    return <p className="text-slate-400">Building your plans…</p>;
  }

  if (!plans?.plans?.length) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-white">No plan yet</h1>
        <p className="mt-2 text-slate-400">Set your budget and preferences to generate three ready-to-invest plans.</p>
        <Link to="/build" className="btn-primary mt-4 inline-block">Build my income plan</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Your recommendation</h1>
          <p className="mt-1 text-sm text-slate-400">
            Three ready-to-invest plans for {money(Number(planInputs.budget))}. Risky funds are already
            excluded. Pick the risk/income trade-off that fits you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/build" className="btn-ghost text-sm">Adjust inputs</Link>
          <button className="btn-ghost text-sm" onClick={saveScenario}>Save scenario</button>
        </div>
      </div>

      {plans.excluded_risky?.length > 0 && (
        <p className="text-sm text-slate-400">
          Excluded as Risky (likely to cut):{" "}
          <span className="text-rose-300">{plans.excluded_risky.map((t) => t.replace(".TO", "")).join(", ")}</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.plans.map((p) => (
          <PlanCard key={p.name} plan={p} onSelectEtf={openEtf} />
        ))}
      </div>

      <PlanComparison plans={plans.plans} incomeGoal={incomeGoal} />

      {savedScenario && (
        <ScenarioCompare saved={savedScenario} current={plans.plans} onClear={clearScenario} />
      )}

      <FrontierChart frontier={plans.frontier} plans={plans.plans} incomeGoal={incomeGoal} />
    </div>
  );
}

// Compact A/B of a saved scenario's monthly income vs. the current one, per plan.
function ScenarioCompare({ saved, current, onClear }) {
  const byName = (list, name) => list.find((p) => p.name === name);
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Scenario compare</h2>
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={onClear}>Clear</button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Monthly income: your saved <span className="text-slate-300">{saved.label}</span> vs. the current inputs.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {["Safe", "Balanced", "High-risk"].map((name) => {
          const a = byName(saved.plans, name);
          const b = byName(current, name);
          if (!a || !b) return null;
          const delta = b.monthly_income - a.monthly_income;
          return (
            <div key={name} className="rounded-xl border border-edge bg-panel2 p-3">
              <div className={`text-sm font-semibold ${PLAN_ACCENT[name] || "text-white"}`}>{name}</div>
              <div className="mt-1 flex items-baseline gap-2 text-sm">
                <span className="text-slate-500">{money(a.monthly_income)}</span>
                <span className="text-slate-500">→</span>
                <span className="text-slate-100">{money(b.monthly_income)}</span>
              </div>
              <div className={`text-xs ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {delta >= 0 ? "+" : "−"}{money(Math.abs(delta))}/mo
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
