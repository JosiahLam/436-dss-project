import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { usePerch } from "../context/PerchContext";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { money, pct, PLAN_ACCENT } from "../lib/format";
import CinematicPlanCard from "../components/results/CinematicPlanCard";
import AllocationBars from "../components/results/AllocationBars";
import WealthProjection from "../components/results/WealthProjection";
import PlanComparison from "../components/PlanComparison";
import FrontierChart from "../components/FrontierChart";
import AccountSplit from "../components/AccountSplit";
import Reveal from "../components/fx/Reveal";
import Magnetic from "../components/fx/Magnetic";
import RiskBadge from "../components/RiskBadge";

export default function Recommendation() {
  const {
    plans, planInputs, incomeGoal, hasData, optimizing, openEtf,
    savedScenario, saveScenario, clearScenario,
  } = usePerch();
  const reduced = usePrefersReducedMotion();
  const [selected, setSelected] = useState("Balanced");

  const list = plans?.plans ?? [];
  const maxVol = useMemo(() => Math.max(...list.map((p) => p.expected_volatility), 0.0001), [list]);
  const current = list.find((p) => p.name === selected) || list[0];
  const goal = Number(incomeGoal) || 0;

  useEffect(() => {
    if (list.length && !list.some((p) => p.name === selected)) setSelected(list[0].name);
  }, [list, selected]);

  if (!hasData || (optimizing && !plans)) return <BuildingState />;

  if (!list.length) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Reveal className="text-center">
          <motion.div
            animate={reduced ? {} : { y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-white/[0.04] text-4xl"
          >
            🪺
          </motion.div>
          <h1 className="mt-6 text-2xl font-semibold text-white">No plan yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-400">
            Tell Perch your budget and preferences, and it will build three ready-to-invest plans.
          </p>
          <Magnetic strength={0.4} className="mt-6 inline-block">
            <Link to="/build" className="rounded-full bg-brand px-7 py-3 font-medium text-ink shadow-[0_10px_40px_-10px_rgba(52,211,153,0.6)]">
              Build my income plan
            </Link>
          </Magnetic>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="relative space-y-10">
      {/* ambient glow behind the cards */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 h-[420px] -z-10"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(56,189,248,0.10), transparent 70%)" }}
      />

      {/* header */}
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Your recommendation</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Three ways to invest{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
              {money(Number(planInputs.budget))}
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-slate-400">
            Risky funds are already excluded. Hover a plan for its holdings, click to explore it in depth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Magnetic strength={0.3}>
            <Link to="/build" className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm text-slate-100 backdrop-blur transition hover:border-white/30">
              Adjust inputs
            </Link>
          </Magnetic>
          <Magnetic strength={0.3}>
            <button onClick={saveScenario} className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm text-slate-100 backdrop-blur transition hover:border-white/30">
              Save scenario
            </button>
          </Magnetic>
        </div>
      </Reveal>

      {plans.excluded_risky?.length > 0 && (
        <Reveal>
          <p className="text-sm text-slate-400">
            Excluded as likely to cut:{" "}
            <span className="text-rose-300">{plans.excluded_risky.map((t) => t.replace(".TO", "")).join(", ")}</span>
          </p>
        </Reveal>
      )}

      {/* three cinematic cards */}
      <div className="grid gap-6 lg:grid-cols-3" style={{ perspective: 1400 }}>
        {list.map((p, i) => (
          <CinematicPlanCard
            key={p.name}
            plan={p}
            index={i}
            maxVol={maxVol}
            goal={goal}
            selected={selected === p.name}
            onSelect={setSelected}
            onSelectEtf={openEtf}
          />
        ))}
      </div>

      {/* selected-plan deep dive */}
      <Reveal>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Explore a plan</h2>
            <Segmented options={list.map((p) => p.name)} value={selected} onChange={setSelected} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 grid gap-6 lg:grid-cols-2"
            >
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">
                  Every holding · {current.n_holdings} funds
                </div>
                <AllocationBars holdings={current.holdings} onSelect={openEtf} />
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Monthly income" value={money(current.monthly_income)} accent={PLAN_ACCENT[current.name]} />
                  <Metric label="Portfolio yield" value={pct(current.portfolio_yield, 2)} />
                  <Metric label="Volatility" value={pct(current.expected_volatility, 1)} />
                  <Metric label="Income from Safe" value={pct(current.income_secured_pct, 0)} />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Risk mix</div>
                  <div className="flex flex-wrap gap-2">
                    {["Safe", "Watch", "Risky"].map((r) => {
                      const n = current.holdings.filter((h) => h.risk === r).length;
                      if (!n) return null;
                      return (
                        <span key={r} className="flex items-center gap-1.5 text-xs text-slate-300">
                          <RiskBadge risk={r} /> × {n}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {current.account_allocation && <AccountSplit allocation={current.account_allocation} />}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </Reveal>

      {/* wealth projection */}
      <Reveal>
        <WealthProjection plan={current} />
      </Reveal>

      {savedScenario && <Reveal><ScenarioCompare saved={savedScenario} current={list} onClear={clearScenario} /></Reveal>}

      <Reveal><PlanComparison plans={list} incomeGoal={incomeGoal} /></Reveal>
      <Reveal><FrontierChart frontier={plans.frontier} plans={list} incomeGoal={incomeGoal} /></Reveal>
    </div>
  );
}

// Animated segmented control with a sliding active pill.
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`relative rounded-full px-4 py-1.5 text-sm transition-colors ${
            value === o ? "text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {value === o && (
            <motion.span
              layoutId="segmented-pill"
              className="absolute inset-0 rounded-full bg-white/10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative">{o}</span>
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${accent || "text-white"}`}>{value}</div>
    </div>
  );
}

// Elegant loading state — physics dots, never a spinner.
function BuildingState() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-brand"
              animate={{ y: [0, -12, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-400">Optimizing your three plans…</p>
      </div>
    </div>
  );
}

function ScenarioCompare({ saved, current, onClear }) {
  const byName = (list, name) => list.find((p) => p.name === name);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Scenario compare</h2>
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={onClear}>Clear</button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Monthly income: saved <span className="text-slate-300">{saved.label}</span> vs. current inputs.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {["Safe", "Balanced", "High-risk"].map((name) => {
          const a = byName(saved.plans, name);
          const b = byName(current, name);
          if (!a || !b) return null;
          const delta = b.monthly_income - a.monthly_income;
          return (
            <div key={name} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className={`text-sm font-semibold ${PLAN_ACCENT[name]}`}>{name}</div>
              <div className="mt-1 flex items-baseline gap-2 text-sm">
                <span className="text-slate-500">{money(a.monthly_income)}</span>
                <span className="text-slate-600">→</span>
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
