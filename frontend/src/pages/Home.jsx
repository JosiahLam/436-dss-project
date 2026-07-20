import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { usePerch } from "../context/PerchContext";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import AuroraBackground from "../components/fx/AuroraBackground";
import WaterRipple from "../components/fx/WaterRipple";
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
  { icon: "◈", title: "Predicts dividend cuts", body: "Flags funds likely to cut their payout — before you buy in." },
  { icon: "⛌", title: "Screens out the risk", body: "The riskiest funds are set aside automatically." },
  { icon: "✦", title: "Builds three plans", body: "Safe, Balanced, and High-risk — exact shares, expected income." },
  { icon: "⟐", title: "Tax-smart placement", body: "Splits each plan across TFSA, RRSP, and FHSA." },
];

const STEPS = [
  ["Explore", "See every fund scored for cut risk and yield."],
  ["Build", "Set your budget, horizon, and preferences."],
  ["See the picks", "Check the plain-English reason behind each score."],
  ["Get 3 plans", "Compare ready-to-invest portfolios and choose one."],
];

const FAQS = [
  ["Is this investment advice?", "No. Perch is an educational decision-support prototype. It helps you research and compare — the decisions, and the risk, stay yours."],
  ["How does it choose funds?", "A model estimates each fund's chance of cutting its dividend, ranks them, and sets the riskiest aside. Then an optimizer balances income against steadiness."],
  ["Where does the data come from?", "Live market data for a universe of Canadian income ETFs, with a synthetic fallback so the demo always works offline."],
  ["Can I customize the plans?", "Yes — set your budget, time horizon, per-fund and per-category caps, an income goal, and your accounts. Everything re-optimizes instantly."],
];

const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

// The sticky NavBar's rendered height — sections offset their scroll-snap
// target by this so the nav never overlaps a section's content when it lands.
const NAV_H = 57;

export default function Home() {
  const { runInfo, etfs } = usePerch();
  const reduced = usePrefersReducedMotion();
  const canAnimate = useCanAnimate();
  const heroRef = useRef(null);

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

  // Full-page scroll-snap, scoped to this page only (native browser snap,
  // not Lenis — see useLenis(disabled) in AppLayout). CSS snap alone is the
  // touch/fallback baseline, but a single mouse-wheel notch rarely moves far
  // enough to cross a mandatory snap's halfway threshold — it either does
  // nothing or takes several scrolls, which feels disconnected. So on top of
  // the CSS we drive wheel (and keyboard) input ourselves: one gesture = one
  // section, with a lock so a continuous trackpad scroll can't skip past the
  // very next section. Respects reduced-motion by falling back to plain CSS
  // snap with no imposed animation/lock.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("snap-y", "snap-mandatory");
    if (reduced) return () => root.classList.remove("snap-y", "snap-mandatory");

    let locked = false;
    let unlockTimer = null;

    const sectionEls = () => Array.from(document.querySelectorAll("main section.snap-start"));

    const currentIndex = (els) => {
      let idx = 0, best = Infinity;
      els.forEach((el, i) => {
        const d = Math.abs(el.getBoundingClientRect().top);
        if (d < best) { best = d; idx = i; }
      });
      return idx;
    };

    const goTo = (dir) => {
      if (locked) return;
      const els = sectionEls();
      const idx = currentIndex(els);
      const next = Math.min(Math.max(idx + dir, 0), els.length - 1);
      if (next === idx) return;
      locked = true;
      els[next].scrollIntoView({ behavior: "smooth", block: "start" });
      // Unlock on whichever comes first: the native scrollend event, or a
      // fallback timer. The timer is a safety net so `locked` can never get
      // stuck forever if scrollend doesn't fire for some reason (unsupported
      // browser, an interrupted scroll, etc.) — always armed, not just the
      // "no scrollend support" branch.
      let unlocked = false;
      const unlock = () => {
        if (unlocked) return;
        unlocked = true;
        locked = false;
        window.removeEventListener("scrollend", unlock);
        clearTimeout(unlockTimer);
      };
      window.addEventListener("scrollend", unlock, { once: true });
      unlockTimer = setTimeout(unlock, 900);
    };

    const onWheel = (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 2) return;
      goTo(e.deltaY > 0 ? 1 : -1);
    };

    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(-1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.classList.remove("snap-y", "snap-mandatory");
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(unlockTimer);
    };
  }, [reduced]);

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
  const snapSection = "scroll-mt-[57px]"; // keep literal in sync with NAV_H above — Tailwind needs a static string

  return (
    <div className="relative left-1/2 -my-6 w-screen -translate-x-1/2 overflow-x-hidden">
      <AuroraBackground reduced={reduced} />

      {/* ============================= 1 · HERO ============================= */}
      <section
        ref={heroRef}
        onPointerMove={onHeroMove}
        className={`relative flex h-[100dvh] snap-start flex-col items-center justify-center overflow-hidden px-4 text-center ${snapSection}`}
      >
        {!reduced && <WaterRipple containerRef={heroRef} reduced={reduced} />}

        <div className="relative z-10 flex flex-col items-center">
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

      {/* ============ 2 · WHAT PERCH DOES + UNDER THE HOOD ============ */}
      <section className={`relative flex min-h-[100dvh] flex-col justify-center px-4 py-10 sm:py-14 ${snapSection} snap-start`}>
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="mb-5 text-center sm:mb-8">
            <div className="label text-slate-400">What Perch does</div>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Research that runs itself</h2>
          </Reveal>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4" style={{ perspective: 1200 }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <TiltCard className="h-full p-4 sm:p-5">
                  <div className="text-2xl text-emerald-300">{f.icon}</div>
                  <h3 className="mt-3 text-sm font-semibold text-white">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-slate-400">{f.body}</p>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1} className="mt-6 text-center sm:mt-10">
            <div className="label text-slate-400">Under the hood</div>
            <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">From raw market data to a plan</h2>
          </Reveal>
          <Reveal delay={0.16} className="mt-4 sm:mt-6">
            <PipelineDemo />
          </Reveal>
        </div>
      </section>

      {/* ================ 3 · STATISTICS + HOW IT WORKS ================ */}
      <section className={`relative flex min-h-[100dvh] flex-col justify-center px-4 py-14 ${snapSection} snap-start`}>
        <div className="mx-auto w-full max-w-5xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { to: fundCount, suffix: "", label: "income funds scored" },
              { to: 4, suffix: "", label: "asset classes covered" },
              { to: 3, suffix: "", label: "ready-to-invest plans" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.06}>
                <TiltCard className="p-5 text-center" max={6}>
                  <div className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-semibold text-transparent">
                    <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
                  </div>
                  <div className="mt-1.5 text-sm text-slate-400">{s.label}</div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal className="mb-8 mt-14 text-center">
            <div className="label text-slate-400">How it works</div>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Four steps to a plan</h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.05}>
                <div className="flex items-start gap-3 lg:flex-col lg:items-start lg:gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-base font-semibold text-white">{t}</div>
                    <p className="mt-0.5 text-sm text-slate-400">{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 4 · GOOD TO KNOW + FINAL CTA ================= */}
      <section className={`relative flex min-h-[100dvh] flex-col justify-center px-4 py-14 ${snapSection} snap-start`}>
        <div className="mx-auto w-full max-w-3xl">
          <Reveal className="mb-6 text-center">
            <div className="label text-slate-400">Good to know</div>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Questions, answered</h2>
          </Reveal>
          <div className="space-y-2.5">
            {FAQS.map((f, i) => (
              <Reveal key={f[0]} delay={i * 0.03}>
                <FaqItem q={f[0]} a={f[1]} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1} className="mt-10">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 120% at 50% 0%, rgba(52,211,153,0.16), transparent 70%)" }} />
              <div className="relative">
                <h2 className="mx-auto max-w-xl text-2xl font-semibold text-white sm:text-4xl">
                  Your steadier income, one click away.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm text-slate-300">
                  Build three transparent, ready-to-invest plans in under a minute. Free, and always labeled —
                  not investment advice.
                </p>
                <div className="mt-6 flex justify-center">
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
        </div>
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
        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left text-slate-100 transition hover:bg-white/[0.03]"
      >
        <span className="text-sm font-medium">{q}</span>
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
              <p className="px-5 pb-4 text-[13px] leading-5 text-slate-400">{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && <p className="px-5 pb-4 text-[13px] leading-5 text-slate-400">{a}</p>
      )}
    </div>
  );
}
