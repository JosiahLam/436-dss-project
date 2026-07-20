import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { money, pct, CATEGORY_COLORS, CATEGORY_LABELS } from "../../lib/format";
import { useCanAnimate } from "../../lib/ioSupport";

// A donut that draws itself: each holding is an arc that sweeps in with a
// staggered spring. Hovering a slice lifts it and reveals the fund.
export default function AllocationDonut({ holdings, size = 190, stroke = 22, delay = 0 }) {
  const [hover, setHover] = useState(null);
  const canAnimate = useCanAnimate();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;

  const segments = useMemo(() => {
    const total = holdings.reduce((s, h) => s + h.allocation, 0) || 1;
    let acc = 0;
    return holdings.map((h) => {
      const frac = h.allocation / total;
      const seg = { ...h, frac, offset: acc };
      acc += frac;
      return seg;
    });
  }, [holdings]);

  const active = hover != null ? segments[hover] : null;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {segments.map((s, i) => (
          <motion.circle
            key={s.ticker}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={CATEGORY_COLORS[s.category] || "#64748b"}
            strokeWidth={hover === i ? stroke + 6 : stroke}
            strokeLinecap="butt"
            strokeDasharray={`${s.frac * C} ${C}`}
            initial={canAnimate ? { strokeDashoffset: C * 0.999, opacity: 0 } : false}
            animate={{ strokeDashoffset: -s.offset * C, opacity: hover == null || hover === i ? 1 : 0.35 }}
            transition={{
              strokeDashoffset: { type: "spring", stiffness: 55, damping: 18, delay: delay + i * 0.07 },
              opacity: { duration: 0.25 },
              strokeWidth: { duration: 0.2 },
            }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>

      {/* center readout */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {active ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="text-sm font-semibold text-white">{active.ticker.replace(".TO", "")}</div>
            <div className="text-[11px] text-slate-400">{pct(active.frac, 0)} · {money(active.allocation)}</div>
            <div className="text-[10px] text-slate-500">{CATEGORY_LABELS[active.category]}</div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5 }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Holdings</div>
            <div className="text-2xl font-semibold text-white">{holdings.length}</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
