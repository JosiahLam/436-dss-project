import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { usePerch } from "../context/PerchContext";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import AuroraBackground from "../components/fx/AuroraBackground";
import ParticleField from "../components/fx/ParticleField";
import Magnetic from "../components/fx/Magnetic";
import TiltCard from "../components/fx/TiltCard";
import Reveal from "../components/fx/Reveal";
import PipelineDemo from "../components/home/PipelineDemo";
import CountUp from "../components/home/CountUp";
import { useCanAnimate } from "../lib/ioSupport";

const HEAD_LINE1 = ["Steady", "monthly", "income,"];
const HEAD_LINE2 = ["without", "the", "guesswork."];

const wordV = {
  hidden: { opacity: 0, y: 46, filter: "blur(12px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};

const FEATURES = [
  { icon: "◈", title: "Predicts dividend cuts", body: "A model flags funds likely to cut their payout in the next year — before you buy in." },
  { icon: "⛌", title: "Screens out the risk", body: "The funds most likely to cut are set aside automatically, so plans start from safe ground." },
  { icon: "✦", title: "Builds three plans", body: "Safe, Balanced, and High-risk portfolios — exact shares and expected monthly income." },
  { icon: "⟐", title: "Tax-smart placement", body: "Shows how to split each plan across TFSA, RRSP, and FHSA to keep more of your income." },
];

const STEPS = [
  ["Explore", "See every fund scored for cut risk and yield on one map."],
  ["Build", "Set your budget, horizon, and preferences in seconds."],
  ["See the picks", "Check the plain-English reason behind every score."],
  ["Get 3 plans", "Compare ready-to-invest portfolios and choose one."],
];

const FAQS = [
  ["Is this investment advice?", "No. Perch is an educational decision-support prototype. It helps you research and compare — the decisions, and the risk, stay yours."],
  ["How does it choose funds?", "A model estimates each fund's chance of cutting its dividend, ranks them, and sets the riskiest aside. Then an optimizer balances income against steadiness."],
  ["Where does the data come from?", "Live market data for a universe of Canadian income ETFs, with a synthetic fallback so the demo always works offline."],
  ["Can I customize the plans?", "Yes — set your budget, time horizon, per-fund and per-category caps, an income goal, and your accounts. Everything re-optimizes instantly."],
];

const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

export default function Home() {
  const { runInfo, etfs } = usePerch();
  const reduced = usePrefersReducedMotion();
  const canAnimate = useCanAnimate();
  const heroRef = useRef(null);
  const [spelling, setSpelling] = useState(false);

  // Headline drifts a few px opposite the cursor — gravity, not tracking.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const dx = useSpring(useTransform(mx, (v) => v * -14), { stiffness: 120, damping: 20 });
  const dy = useSpring(useTransform(my, (v) => v * -14), { stiffness: 120, damping: 20 });

  const onHeroMove = (e) => {
    if (reduced) return;
    const r = heroRef.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) / r.width);
    my.set((e.clientY - (r.top + r.height / 2)) / r.height);
  };

  // Konami easter egg → re-tint the whole scene.
  useEffect(() => {
    let idx = 0;
    const onKey = (e) => {
      idx = e.key === KONAMI[idx] ? idx + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (idx === KONAMI.length) {
        document.documentElement.classList.toggle("konami-active");
        idx = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("konami-active");
    };
  }, []);

  const fundCount = etfs.length || 60;

  return (
    <div className="relative left-1/2 -mt-6 w-screen -translate-x-1/2 overflow-x-hidden">
      <AuroraBackground reduced={reduced} />
      {/* ============================= HERO ============================= */}
      <section
        ref={heroRef}
        onPointerMove={onHeroMove}
        className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-4 text-center"
      >
        {!reduced && <ParticleField reduced={reduced} onWordMode={setSpelling} />}

        <div
          className="relative z-10 flex flex-col items-center transition-all duration-700"
          style={{ opacity: spelling ? 0.1 : 1, filter: spelling ? "blur(3px)" : "none" }}
        >
          <Magnetic strength={0.4}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-slate-300 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
              Perch · dividend-ETF decision support
            </span>
          </Magnetic>

          <motion.h1
            style={{ x: dx, y: dy }}
            initial={canAnimate ? "hidden" : false}
            animate="show"
            transition={{ staggerChildren: 0.1, delayChildren: 0.15 }}
            className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-7xl"
          >
            <span className="block">
              {HEAD_LINE1.map((w) => (
                <motion.span key={w} variants={wordV} className={`mr-3 inline-block ${w === "income," ? "text-sheen" : ""}`}>
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block">
              {HEAD_LINE2.map((w) => (
                <motion.span key={w} variants={wordV} className="mr-3 inline-block">
                  {w}
                </motion.span>
              ))}
            </span>
          </motion.h1>

          <motion.p
            initial={canAnimate ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-6 max-w-xl text-lg text-slate-300"
          >
            Perch predicts which dividend ETFs are likely to cut their payout, drops the risky ones, and
            builds three ready-to-invest plans — turning hours of research into an instant, transparent plan.
          </motion.p>

          <motion.div
            initial={canAnimate ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.8 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              to="/build"
              className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3 font-medium text-ink shadow-[0_10px_40px_-10px_rgba(52,211,153,0.6)] transition-transform duration-200 hover:scale-105"
            >
              Build my income plan
              <span>→</span>
            </Link>
            <Link
              to="/analytics"
              className="rounded-full border border-white/15 bg-white/[0.03] px-7 py-3 font-medium text-slate-100 backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:scale-105 hover:border-white/30 hover:bg-white/[0.07]"
            >
              Explore the funds
            </Link>
          </motion.div>

          {runInfo?.run_date && (
            <motion.p
              initial={canAnimate ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 1 }}
              className="mt-6 text-xs text-slate-500"
            >
              {fundCount} funds last scored {runInfo.run_date} ·{" "}
              {runInfo.data_source === "yahoo" ? "live market data" : "demo data"}
            </motion.p>
          )}
        </div>

        {/* scroll cue */}
        {!reduced && (
          <motion.div
            initial={canAnimate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
          >
            <div className="flex h-9 w-5 items-start justify-center rounded-full border border-white/20 p-1">
              <motion.span animate={{ y: [0, 10, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            </div>
          </motion.div>
        )}
      </section>

      {/* ========================= FEATURE GRID ======================== */}
      <section className="relative mx-auto max-w-6xl px-4 py-24">
        <Reveal className="mb-12 text-center">
          <div className="label text-slate-400">What Perch does</div>
          <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Research that runs itself</h2>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" style={{ perspective: 1200 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <TiltCard className="h-full p-6">
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }} className="text-3xl text-emerald-300">
                  {f.icon}
                </motion.div>
                <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{f.body}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ====================== INTERACTIVE DEMO ======================= */}
      <section className="relative mx-auto max-w-6xl px-4 py-16">
        <Reveal className="mb-10 text-center">
          <div className="label text-slate-400">Under the hood</div>
          <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">From raw market data to a plan</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Every fund flows through the same pipeline — scored, screened, and optimized — so what you see is
            consistent and explainable.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <PipelineDemo />
        </Reveal>
      </section>

      {/* ============================ STATS =========================== */}
      <section className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { to: fundCount, suffix: "", label: "income funds scored" },
            { to: 4, suffix: "", label: "asset classes covered" },
            { to: 3, suffix: "", label: "ready-to-invest plans" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <TiltCard className="p-6 text-center" max={6}>
                <div className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-semibold text-transparent sm:text-5xl">
                  <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-sm text-slate-400">{s.label}</div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ========================== TIMELINE ========================== */}
      <section className="relative mx-auto max-w-3xl px-4 py-20">
        <Reveal className="mb-12 text-center">
          <div className="label text-slate-400">How it works</div>
          <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Four steps to a plan</h2>
        </Reveal>
        <div className="relative pl-8">
          <div className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-emerald-400/60 via-white/15 to-transparent" />
          {STEPS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.06} className="relative mb-9 last:mb-0">
              <span className="absolute -left-8 top-1 grid h-4 w-4 place-items-center rounded-full bg-ink">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]" />
              </span>
              <div className="text-lg font-semibold text-white">{t}</div>
              <p className="mt-1 text-slate-400">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================= FAQ ============================ */}
      <section className="relative mx-auto max-w-3xl px-4 py-20">
        <Reveal className="mb-10 text-center">
          <div className="label text-slate-400">Good to know</div>
          <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f[0]} delay={i * 0.04}>
              <FaqItem q={f[0]} a={f[1]} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ========================== FINAL CTA ========================= */}
      <section className="relative mx-auto max-w-5xl px-4 pb-28 pt-10">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 120% at 50% 0%, rgba(52,211,153,0.16), transparent 70%)" }} />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold text-white sm:text-5xl">
                Your steadier income, one click away.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-slate-300">
                Build three transparent, ready-to-invest plans in under a minute. Free, and always labeled —
                not investment advice.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  to="/build"
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3.5 font-medium text-ink shadow-[0_10px_40px_-10px_rgba(52,211,153,0.6)] transition-transform duration-200 hover:scale-105"
                >
                  Build my income plan
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  const canAnimate = useCanAnimate();
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-slate-100 transition hover:bg-white/[0.03]"
      >
        <span className="font-medium">{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} className="text-xl text-emerald-300">+</motion.span>
      </button>
      {canAnimate ? (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <p className="px-5 pb-5 text-sm leading-6 text-slate-400">{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && <p className="px-5 pb-5 text-sm leading-6 text-slate-400">{a}</p>
      )}
    </div>
  );
}
