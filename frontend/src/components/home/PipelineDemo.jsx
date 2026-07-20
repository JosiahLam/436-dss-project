import { motion } from "framer-motion";

const STAGES = [
  { key: "ingest", label: "Ingest", sub: "yields & prices", icon: "↧" },
  { key: "model", label: "Model", sub: "predict cuts", icon: "◈" },
  { key: "screen", label: "Screen", sub: "drop the risky", icon: "⛌" },
  { key: "optimize", label: "Optimize", sub: "balance income", icon: "⟐" },
  { key: "plans", label: "3 plans", sub: "ready to invest", icon: "✦" },
];

// A living mockup of the Perch pipeline: stages float, light pulses travel the
// connectors, and a tiny model "scores" funds in a loop. Hovering a stage lifts
// and lights it. It is decorative — the real thing runs on the backend.
export default function PipelineDemo() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-10">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(52,211,153,0.10), transparent 70%)" }} />

      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-4 md:flex-col md:gap-0">
            <motion.div
              whileHover={{ y: -6, scale: 1.04 }}
              animate={{ y: [0, -5, 0] }}
              transition={{ y: { duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut" } }}
              className="group relative grid w-full place-items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center transition-colors hover:border-emerald-300/40 md:w-32"
            >
              <span className="text-2xl text-cyan-200 transition-colors group-hover:text-emerald-300">{s.icon}</span>
              <div className="mt-1 text-sm font-semibold text-white">{s.label}</div>
              <div className="text-[11px] text-slate-400">{s.sub}</div>
              {s.key === "model" && <MiniBars />}
              <span className="pointer-events-none absolute inset-0 rounded-xl opacity-0 shadow-[0_0_40px_-6px_rgba(52,211,153,0.6)] transition-opacity duration-300 group-hover:opacity-100" />
            </motion.div>

            {i < STAGES.length - 1 && <Connector delay={i * 0.5} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// Animated connector with a light pulse traveling across it.
function Connector({ delay }) {
  return (
    <div className="relative h-8 w-full shrink-0 md:mx-1 md:h-px md:flex-1">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-white/5 via-white/20 to-white/5 md:left-0 md:top-1/2 md:h-px md:w-full md:-translate-x-0 md:-translate-y-1/2 md:bg-gradient-to-r" />
      <motion.span
        className="absolute h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]"
        style={{ left: "50%", marginLeft: -3 }}
        animate={{ top: ["-4px", "100%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay }}
      />
      <motion.span
        className="absolute hidden h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)] md:block"
        style={{ top: "50%", marginTop: -3 }}
        animate={{ left: ["-4px", "100%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay }}
      />
    </div>
  );
}

// Tiny bars inside the Model node that reshuffle, hinting at live scoring.
function MiniBars() {
  return (
    <div className="mt-2 flex h-6 items-end gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-sm bg-gradient-to-t from-cyan-400/60 to-emerald-300"
          animate={{ height: ["30%", "100%", "50%", "80%", "30%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
          style={{ height: "40%" }}
        />
      ))}
    </div>
  );
}
