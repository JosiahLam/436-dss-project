import { useRef } from "react";
import { motion } from "framer-motion";
import { useRevealVisible, useCanAnimate } from "../../lib/ioSupport";

// Scroll-driven entrance: fade + blur + rise, once.
// Drives `animate` explicitly (not `whileInView`) so ancestor variant
// propagation can't suppress it. If the environment can't animate (hidden tab,
// throttled rAF), it renders at the final state instead of staying invisible.
export default function Reveal({ children, className = "", delay = 0, y = 28 }) {
  const ref = useRef(null);
  const visible = useRevealVisible(ref);
  const canAnimate = useCanAnimate();
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={canAnimate ? { opacity: 0, y, filter: "blur(8px)" } : false}
      animate={!canAnimate || visible ? shown : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
