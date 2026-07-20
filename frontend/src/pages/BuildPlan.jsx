import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { usePerch } from "../context/PerchContext";
import PlanWizard from "../components/build/PlanWizard";
import Reveal from "../components/fx/Reveal";
import { useCanAnimate } from "../lib/ioSupport";

export default function BuildPlan() {
  const navigate = useNavigate();
  const canAnimate = useCanAnimate();
  const { etfs, hasData, optimizing, budget, setBudget, incomeGoal, setIncomeGoal, buildPlans } = usePerch();

  const onBuild = async (body) => {
    try {
      await buildPlans(body, true);
      navigate("/recommendation");
    } catch {
      /* error is surfaced in the layout banner */
    }
  };

  if (!hasData) return <p className="text-slate-400">Loading the fund universe…</p>;

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 140% at 50% 0%, rgba(52,211,153,0.12), transparent 70%)" }} />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Guided setup
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Build your personalized income plan
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              A model flags funds likely to cut their payout, then an optimizer builds three ready-to-invest
              plans from what's left — Safe, Balanced, and High-risk. A few questions, about two minutes.
            </p>
          </div>
        </div>
      </Reveal>

      {optimizing ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="text-center">
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2.5 w-2.5 rounded-full bg-brand"
                  initial={canAnimate ? { opacity: 0.4 } : false}
                  animate={{ y: [0, -12, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                />
              ))}
            </div>
            <p className="mt-5 text-sm text-slate-400">Screening funds and optimizing your three plans…</p>
          </div>
        </div>
      ) : (
        <Reveal delay={0.05}>
          <PlanWizard
            etfs={etfs}
            onBuild={onBuild}
            loading={optimizing}
            budget={budget}
            setBudget={setBudget}
            incomeGoal={incomeGoal}
            setIncomeGoal={setIncomeGoal}
            ctaLabel="Generate My Income Plan"
          />
        </Reveal>
      )}

      <p className="text-center text-xs text-slate-500">Not investment advice.</p>
    </div>
  );
}
