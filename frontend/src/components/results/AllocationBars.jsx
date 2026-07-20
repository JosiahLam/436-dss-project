import { useRef } from "react";
import { motion } from "framer-motion";
import { money, pct, CATEGORY_COLORS } from "../../lib/format";
import { useRevealVisible, useCanAnimate } from "../../lib/ioSupport";

// Holdings as bars that grow from zero with a staggered spring.
// Hovering a row lifts it and surfaces its monthly income.
export default function AllocationBars({ holdings, onSelect, delay = 0, limit }) {
  const ref = useRef(null);
  const visible = useRevealVisible(ref, { margin: 20 });
  const canAnimate = useCanAnimate();
  const show = !canAnimate || visible;
  const rows = limit ? holdings.slice(0, limit) : holdings;
  const maxW = Math.max(...rows.map((h) => h.weight), 0.0001);

  return (
    <div className="space-y-2" ref={ref}>
      {rows.map((h, i) => (
        <motion.button
          key={h.ticker}
          onClick={() => onSelect?.(h.ticker)}
          whileHover={{ x: 3 }}
          initial={canAnimate ? { opacity: 0, x: -8 } : false}
          animate={show ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: delay + i * 0.05, duration: 0.4 }}
          className="group block w-full text-left"
        >
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-slate-200 group-hover:text-white">
              {h.ticker.replace(".TO", "")}
            </span>
            <span className="tabular-nums text-slate-500 group-hover:text-slate-300">
              {pct(h.weight, 0)} · {money(h.monthly_income)}/mo
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: CATEGORY_COLORS[h.category] || "#64748b" }}
              initial={canAnimate ? { width: 0 } : false}
              animate={show ? { width: `${(h.weight / maxW) * 100}%` } : {}}
              transition={{ type: "spring", stiffness: 60, damping: 18, delay: delay + i * 0.05 }}
            />
          </div>
        </motion.button>
      ))}
      {limit && holdings.length > limit && (
        <div className="pt-1 text-[11px] text-slate-500">+{holdings.length - limit} more holdings</div>
      )}
    </div>
  );
}
