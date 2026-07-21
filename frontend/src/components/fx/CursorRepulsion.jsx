import { useEffect, useRef } from "react";

// Small water-drop dots, blended from Perch's brand colors.
const COLORS = [
  { r: 52, g: 211, b: 153 },   // emerald (brand)
  { r: 34, g: 211, b: 238 },   // cyan
  { r: 129, g: 140, b: 248 },  // indigo
];

const REPEL_RADIUS = 180; // px — cursor influence range
const REPEL_STRENGTH = 2600; // higher = stronger push
const SPRING = 0.024; // pull back toward home position
const DAMPING = 0.85; // velocity decay each frame

// A field of small, still water-drop dots that quietly rest in place until
// the cursor comes near, then drift apart and settle back once it's gone —
// gravity/repulsion, not a cursor-following trail.
export default function CursorRepulsion({ containerRef, reduced }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots = [];
    let raf = null;
    const mouse = { x: -9999, y: -9999 };

    function layout() {
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Jittered grid of resting positions, density scaled to area.
      const spacing = 62;
      const cols = Math.max(4, Math.round(W / spacing));
      const rows = Math.max(3, Math.round(H / spacing));
      const cellW = W / cols;
      const cellH = H / rows;
      dots = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const hx = (i + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.6;
          const hy = (j + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.6;
          dots.push({
            hx, hy, x: hx, y: hy, vx: 0, vy: 0,
            r: 1.6 + Math.random() * 1.8,
            color: COLORS[(Math.random() * COLORS.length) | 0],
          });
        }
      }
    }

    function frame() {
      ctx.clearRect(0, 0, W, H);
      let anyMoving = false;

      for (const d of dots) {
        // spring back toward resting position
        d.vx += (d.hx - d.x) * SPRING;
        d.vy += (d.hy - d.y) * SPRING;

        // repel away from the cursor
        const dx = d.x - mouse.x, dy = d.y - mouse.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < REPEL_RADIUS * REPEL_RADIUS) {
          const dist = Math.sqrt(dist2) || 0.001;
          const force = (1 - dist / REPEL_RADIUS) * (REPEL_STRENGTH / (dist + 20));
          d.vx += (dx / dist) * force * 0.016;
          d.vy += (dy / dist) * force * 0.016;
        }

        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        if (Math.abs(d.vx) > 0.02 || Math.abs(d.vy) > 0.02 || Math.hypot(d.x - d.hx, d.y - d.hy) > 0.3) {
          anyMoving = true;
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.color.r},${d.color.g},${d.color.b},0.55)`;
        ctx.fill();
      }

      // keep animating while the cursor is nearby or dots are still settling
      const cursorNear = mouse.x > -1000;
      raf = anyMoving || cursorNear ? requestAnimationFrame(frame) : null;
    }

    function ensureLoop() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function onMove(e) {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      ensureLoop();
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
      ensureLoop();
    }

    layout();
    // draw the resting field once immediately so dots are visible before any movement
    frame();
    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerleave", onLeave, { passive: true });
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced, containerRef]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
