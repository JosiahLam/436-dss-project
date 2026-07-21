import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePerch } from "../context/PerchContext";
import { useLenis } from "../hooks/useLenis";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useCanAnimate } from "../lib/ioSupport";
import NavBar from "./NavBar";
import EtfDetail from "./EtfDetail";

export default function AppLayout() {
  const { toast, setToast, error, selected, closeEtf } = usePerch();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const canAnimate = useCanAnimate();
  const still = reduced || !canAnimate; // don't hide what we can't reveal
  // Smooth scrolling everywhere, including Home — its scroll-snap only nudges
  // via keyboard (proximity CSS snap for wheel/touch), so it coexists fine.
  useLenis();

  // Land at the top of each new page rather than mid-scroll.
  useEffect(() => {
    if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [location.pathname]);

  // NOTE: use plain objects, not named variants. Variant *labels* propagate to
  // descendants and would suppress child `whileInView` reveals (page renders blank).

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavBar />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="fixed right-4 top-16 z-[60] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-panel2/90 px-4 py-3 text-sm text-slate-100 shadow-lg backdrop-blur"
          >
            <span className="text-emerald-300">✓</span>
            <span>{toast}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-2 text-slate-400 hover:text-slate-100">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NavBar is fixed (not sticky), so main needs top padding to clear it —
          the nav's real height (~57px, see Home.jsx's NAV_H) plus a little
          breathing room. Home cancels part of this to sit flush instead. */}
      <main className="mx-auto max-w-6xl px-4 pb-6 pt-20">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={still ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={still ? {} : { opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={still ? {} : { opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-edge px-4 py-6 text-center text-xs text-slate-500">
        Perch · educational decision-support prototype · not investment advice.
      </footer>

      {selected && <EtfDetail ticker={selected} onClose={closeEtf} />}
    </div>
  );
}
