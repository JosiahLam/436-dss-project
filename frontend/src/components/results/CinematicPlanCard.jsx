import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { money, pct, PLAN_ACCENT } from "../../lib/format";
import { useRevealVisible, useCanAnimate } from "../../lib/ioSupport";
import CountUp from "../home/CountUp";
import AllocationDonut from "./AllocationDonut";
import RiskMeter from "./RiskMeter";
import AllocationBars from "./AllocationBars";

const ACCENT_HEX = { Safe: "#34d399", Balanced: "#38bdf8", "High-risk": "#fbbf24" };

// A large, slowly floating portfolio card that tilts toward the cursor,
// lights up under it, and reveals extra metrics on hover.
export default function CinematicPlanCard({ plan, index, maxVol, selected, onSelect, onSelectEtf, goal }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  const visible = useRevealVisible(ref, { margin: 60 });
  const canAnimate = useCanAnimate();
  const accent = ACCENT_HEX[plan.name] || "#34d399";

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spx = useSpring(px, { stiffness: 140, damping: 18 });
  const spy = useSpring(py, { stiffness: 140, damping: 18 });
  const rotateX = useTransform(spy, (v) => (0.5 - v) * 7);
  const rotateY = useTransform(spx, (v) => (v - 0.5) * 8);
  const glare = useTransform([spx, spy], ([gx, gy]) =>
    `radial-gradient(300px circle at ${gx * 100}% ${gy * 100}%, ${accent}22, transparent 62%)`
  );

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
    setHover(false);
  };

  const meetsGoal = goal > 0 && plan.monthly_income >= goal;

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={reset}
      onClick={() => onSelect(plan.name)}
      initial={canAnimate ? { opacity: 0, y: 40 } : false}
      animate={!canAnimate || visible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="cursor-pointer"
    >
      {/* gentle float */}
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 5 + index * 0.6, repeat: Infinity, ease: "easeInOut" }}
        className={`relative overflow-hidden rounded-3xl border p-6 backdrop-blur-sm transition-colors duration-300 ${
          selected ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20"
        }`}
        style={{ boxShadow: selected ? `0 24px 70px -30px ${accent}` : undefined }}
      >
        <motion.div className="pointer-events-none absolute inset-0" style={{ background: glare, opacity: hover ? 1 : 0 }} />
        {selected && (
          <motion.div
            layoutId="plan-selected-glow"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          />
        )}

        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <h3 className={`text-xl font-semibold ${PLAN_ACCENT[plan.name] || "text-white"}`}>{plan.name}</h3>
              <p className="mt-1 max-w-[16rem] text-xs leading-5 text-slate-400">{plan.blurb}</p>
            </div>
            {meetsGoal && (
              <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                meets goal
              </span>
            )}
          </div>

          {/* headline income */}
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Estimated monthly income</div>
            <div className="text-4xl font-semibold text-white">
              <CountUp to={plan.monthly_income} prefix="$" decimals={0} duration={1.4} />
            </div>
            <div className="text-xs text-slate-400">{money(plan.annual_income)} / year</div>
          </div>

          {/* donut + risk meter */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <AllocationDonut holdings={plan.holdings} size={150} stroke={18} delay={index * 0.12 + 0.2} />
            <RiskMeter value={plan.expected_volatility} max={maxVol} delay={index * 0.12 + 0.3} accent={accent} />
          </div>

          {/* quick stats */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Yield" value={pct(plan.portfolio_yield, 2)} />
            <Stat label="From Safe funds" value={pct(plan.income_secured_pct, 0)} />
          </div>

          {/* hover-revealed detail */}
          <motion.div
            initial={false}
            animate={{ height: hover ? "auto" : 0, opacity: hover ? 1 : 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Top holdings</div>
              <AllocationBars holdings={plan.holdings} onSelect={onSelectEtf} limit={5} />
              <div className="mt-3 flex justify-between text-[11px] text-slate-500">
                <span>{plan.n_holdings} funds</span>
                <span>{money(plan.leftover_cash)} left over</span>
              </div>
            </div>
          </motion.div>

          <div className="mt-4 text-center text-[11px] text-slate-500">
            {selected ? "Selected — details below" : hover ? "Click to explore this plan" : "Hover for holdings"}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-medium text-slate-100">{value}</div>
    </div>
  );
}
