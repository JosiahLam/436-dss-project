import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

// Glass card that tilts in 3D toward the cursor with a specular highlight that
// tracks the pointer. Everything interpolates via springs — nothing snaps.
export default function TiltCard({ children, className = "", max = 10 }) {
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spx = useSpring(px, { stiffness: 150, damping: 18 });
  const spy = useSpring(py, { stiffness: 150, damping: 18 });

  const rotateX = useTransform(spy, (v) => (0.5 - v) * max);
  const rotateY = useTransform(spx, (v) => (v - 0.5) * (max + 2));
  const glare = useTransform([spx, spy], ([gx, gy]) =>
    `radial-gradient(240px circle at ${gx * 100}% ${gy * 100}%, rgba(125,211,252,0.16), transparent 60%)`
  );

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={`group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_20px_60px_-20px_rgba(52,211,153,0.35)] ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: glare }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}
