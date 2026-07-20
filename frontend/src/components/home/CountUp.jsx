import { useEffect, useRef, useState } from "react";
import { useRevealVisible, useCanAnimate } from "../../lib/ioSupport";

// Eases a number up to `to` when it scrolls into view (once).
// If the environment can't animate (hidden tab / throttled rAF), it shows the
// final value immediately rather than sitting at zero.
export default function CountUp({ to, decimals = 0, prefix = "", suffix = "", duration = 1.5 }) {
  const ref = useRef(null);
  const visible = useRevealVisible(ref, { margin: 20 });
  const canAnimate = useCanAnimate();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!canAnimate) {
      setVal(to);
      return undefined;
    }
    if (!visible) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, canAnimate, to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}
