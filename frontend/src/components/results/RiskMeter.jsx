import { motion } from "framer-motion";
import { pct } from "../../lib/format";
import { useCanAnimate } from "../../lib/ioSupport";

// Arc gauge for a plan's expected volatility, scaled against the three plans
// on screen so the comparison is meaningful rather than absolute.
export default function RiskMeter({ value, max, label = "Volatility", delay = 0, accent = "#34d399" }) {
  const canAnimate = useCanAnimate();
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  const size = 132;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const C = Math.PI * r; // half circle

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 22 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        {/* track */}
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* value */}
        <motion.path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={canAnimate ? { strokeDashoffset: C } : false}
          animate={{ strokeDashoffset: C * (1 - frac) }}
          transition={{ type: "spring", stiffness: 45, damping: 16, delay }}
          style={{ filter: `drop-shadow(0 0 6px ${accent}55)` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-lg font-semibold text-white">{pct(value, 1)}</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  );
}
