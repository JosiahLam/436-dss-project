import { useEffect, useState } from "react";

// Can this environment actually run animations? Framer Motion drives everything
// through requestAnimationFrame, which browsers suspend in hidden/background
// tabs. If we can't animate, components must render at their FINAL state rather
// than sitting at `initial` (opacity 0) — otherwise content is invisible.
export function useCanAnimate() {
  const [ok, setOk] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible"
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setOk(false);
    }, 400);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      if (!cancelled) setOk(true);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") setOk(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return ok;
}

// Scroll reveals normally use IntersectionObserver. In some embedded/headless
// browsers IO exists but never fires, which would leave every revealed section
// invisible forever. This hook uses IO when it works and falls back to a plain
// geometry check (on a short timer and on scroll) when it doesn't — so content
// is never permanently hidden, while below-the-fold sections still wait for
// the user to scroll to them.
export function useRevealVisible(ref, { margin = 40 } = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const show = () => setVisible(true);

    const check = () => {
      const node = ref.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      // If the viewport reports zero height we can't judge — reveal rather than hide.
      if (vh === 0) return show();
      if (r.top < vh - margin && r.bottom > margin) show();
    };

    let io;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) show();
        },
        { rootMargin: `-${margin}px` }
      );
      io.observe(el);
    }

    // Fallback: if IO never reported back, decide from geometry.
    const timer = setTimeout(check, 900);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);

    return () => {
      io?.disconnect();
      clearTimeout(timer);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [ref, margin, visible]);

  return visible;
}
