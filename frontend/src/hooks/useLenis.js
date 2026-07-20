import { useEffect } from "react";
import Lenis from "lenis";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

// App-wide buttery smooth scrolling. Disabled when the user prefers reduced
// motion (native scroll takes over). Exposes the instance on window so scroll-
// to-anchor helpers can use it.
export function useLenis() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
      smoothWheel: true,
      touchMultiplier: 1.5,
    });
    window.__lenis = lenis;

    let raf;
    const loop = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      delete window.__lenis;
    };
  }, [reduced]);
}
