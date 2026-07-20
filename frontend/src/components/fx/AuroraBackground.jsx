import { useEffect, useRef } from "react";

const BLOBS = [
  { color: "#34d399", top: "-10%", left: "8%", size: 620, depth: 26, delay: "0s" },
  { color: "#22d3ee", top: "12%", left: "58%", size: 560, depth: 40, delay: "-6s" },
  { color: "#6366f1", top: "42%", left: "24%", size: 700, depth: 18, delay: "-11s" },
  { color: "#a78bfa", top: "48%", left: "66%", size: 520, depth: 52, delay: "-3s" },
];

// Noise via an inline SVG turbulence — no image request, tiny, GPU-composited.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Layers 1–5 from the brief: gradient · particles(sibling) · noise · radial lights · glass.
// Parallax is driven by the pointer, smoothed with a rAF lerp, transforms only.
export default function AuroraBackground({ reduced }) {
  const layerRefs = useRef([]);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reduced) return;
    const onMove = (e) => {
      target.current.x = e.clientX / window.innerWidth - 0.5;
      target.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf;
    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      layerRefs.current.forEach((el, i) => {
        if (!el) return;
        const depth = BLOBS[i]?.depth ?? 24;
        el.style.transform = `translate3d(${-current.current.x * depth}px, ${-current.current.y * depth}px, 0)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink">
      {/* Layer 1: base vertical gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070b16] via-[#0b1220] to-[#05070d]" />

      {/* Layer 4: soft aurora / radial lights */}
      {BLOBS.map((b, i) => (
        <div
          key={i}
          ref={(el) => (layerRefs.current[i] = el)}
          className="absolute will-change-transform"
          style={{ top: b.top, left: b.left, width: b.size, height: b.size }}
        >
          <div
            className="aurora-blob h-full w-full rounded-full opacity-[0.5]"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${b.color}, transparent 62%)`,
              filter: "blur(72px)",
              animationDelay: b.delay,
            }}
          />
        </div>
      ))}

      {/* top spotlight */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh]"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(125,211,252,0.10), transparent 70%)" }}
      />

      {/* Layer 3: noise texture */}
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: NOISE }} />

      {/* Layer 5: glass reflection sweep + vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 40%, transparent 55%, rgba(3,5,10,0.75) 100%)" }}
      />
    </div>
  );
}
