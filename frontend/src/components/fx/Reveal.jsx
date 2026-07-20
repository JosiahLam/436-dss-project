import { motion } from "framer-motion";

// Scroll-driven entrance: fade + blur + rise, triggered once on view.
export default function Reveal({ children, className = "", delay = 0, y = 28 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: { opacity: 0, y, filter: "blur(8px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)" },
      }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
