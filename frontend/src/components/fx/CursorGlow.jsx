import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

// A soft glowing cursor: a large lagging bloom + a small precise ring.
// Pointer-events none so it never blocks clicks. Mounted on the homepage only.
export default function CursorGlow() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const bloomX = useSpring(x, { stiffness: 180, damping: 26, mass: 0.7 });
  const bloomY = useSpring(y, { stiffness: 180, damping: 26, mass: 0.7 });
  const ringX = useSpring(x, { stiffness: 500, damping: 34, mass: 0.4 });
  const ringY = useSpring(y, { stiffness: 500, damping: 34, mass: 0.4 });

  useEffect(() => {
    const move = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);

  const bx = useTransform(bloomX, (v) => v - 190);
  const by = useTransform(bloomY, (v) => v - 190);
  const rx = useTransform(ringX, (v) => v - 13);
  const ry = useTransform(ringY, (v) => v - 13);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] hidden md:block" aria-hidden="true">
      <motion.div
        style={{
          x: bx,
          y: by,
          width: 380,
          height: 380,
          background: "radial-gradient(circle, rgba(52,211,153,0.16), rgba(125,211,252,0.06) 40%, transparent 65%)",
        }}
        className="absolute rounded-full"
      />
      <motion.div
        style={{ x: rx, y: ry }}
        className="absolute h-[26px] w-[26px] rounded-full border border-cyan-200/50 mix-blend-screen"
      />
    </div>
  );
}
