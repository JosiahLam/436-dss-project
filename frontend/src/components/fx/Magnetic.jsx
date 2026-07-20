import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

// Wrap any element to make it drift toward the cursor while hovered, then
// spring back to rest. Used for CTAs, the logo, and floating icons.
export default function Magnetic({ children, strength = 0.35, className, as = "div" }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.5 });

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={{ x: sx, y: sy }} className={className}>
      {children}
    </MotionTag>
  );
}
