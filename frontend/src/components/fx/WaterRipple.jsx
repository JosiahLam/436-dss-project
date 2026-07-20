import { useEffect, useRef } from "react";

// Perch's three primary brand colors, blended subtly per ripple.
const COLORS = [
  { r: 52, g: 211, b: 153 },   // emerald (brand)
  { r: 34, g: 211, b: 238 },   // cyan
  { r: 129, g: 140, b: 248 },  // indigo
];

const DURATION = 1250; // ms — one ripple's full expand+fade lifecycle
const MAX_RADIUS = 120; // px at full expansion
const MIN_SPAWN_DIST = 22; // px the pointer must travel before a new ripple spawns
const MAX_RIPPLES = 36; // safety cap

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// A minimalist cursor-following water-ripple field, scoped to `containerRef`.
// Default state is a bare, empty canvas — nothing draws until the pointer
// moves. Each ripple is three softly offset rings (one per brand color,
// blended with "lighter" compositing) that expand and fade, like a drop
// landing on still water. No idle animation, no persistent trail.
export default function WaterRipple({ containerRef, reduced }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ripples = [];
    let raf = null;
    let lastSpawn = { x: -9999, y: -9999 };

    function layout() {
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x, y) {
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x, y, start: performance.now() });
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      ripples = ripples.filter((rp) => now - rp.start < DURATION);

      if (ripples.length === 0) {
        raf = null; // idle: stop the loop entirely, canvas stays empty
        return;
      }

      ctx.globalCompositeOperation = "lighter";
      for (const rp of ripples) {
        const t = (now - rp.start) / DURATION;
        const eased = easeOutCubic(Math.min(t, 1));
        const radius = eased * MAX_RADIUS;
        const alpha = (1 - t) * 0.4;
        if (alpha <= 0) continue;

        COLORS.forEach((c, i) => {
          const ringR = radius * (1 - i * 0.12);
          if (ringR <= 0) return;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha * (1 - i * 0.18)})`;
          ctx.lineWidth = Math.max(0.5, 2.4 * (1 - eased));
          ctx.stroke();
        });
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }

    function onMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > W || y > H) return;
      const dx = x - lastSpawn.x, dy = y - lastSpawn.y;
      if (Math.hypot(dx, dy) < MIN_SPAWN_DIST) return;
      lastSpawn = { x, y };
      spawn(x, y);
    }

    layout();
    container.addEventListener("pointermove", onMove, { passive: true });
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced, containerRef]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
