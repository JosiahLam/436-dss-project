import { useNavigate } from "react-router-dom";
import { usePerch } from "../context/PerchContext";
import PlanBuilder from "../components/PlanBuilder";

const STEPS = ["Budget & goal", "Preferences", "Accounts", "Generate"];

export default function BuildPlan() {
  const navigate = useNavigate();
  const { etfs, hasData, optimizing, budget, setBudget, incomeGoal, setIncomeGoal, buildPlans } = usePerch();

  const onBuild = async (body) => {
    try {
      await buildPlans(body, true);
      navigate("/recommendation");
    } catch {
      /* error is surfaced in the layout banner */
    }
  };

  if (!hasData) {
    return <p className="text-slate-400">Loading the fund universe…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Build your income plan</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Tell Perch how much to invest and any preferences. It screens out cut-risk funds, then optimizes
          three portfolios for you. Every input below has a short explanation — you can leave the advanced
          ones at their defaults.
        </p>
      </div>

      {/* Decorative progress strip */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 rounded-full border border-edge bg-panel2 px-3 py-1 text-slate-300">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-brand/20 text-[10px] font-semibold text-brand">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <PlanBuilder
        etfs={etfs}
        onBuild={onBuild}
        loading={optimizing}
        budget={budget}
        setBudget={setBudget}
        incomeGoal={incomeGoal}
        setIncomeGoal={setIncomeGoal}
        ctaLabel="Build"
      />

      <p className="text-xs text-slate-500">
        Building generates three plans and takes you to your recommendation. Not investment advice.
      </p>
    </div>
  );
}
