import { useEffect, useRef } from "react";

const PALETTE = ["#34d399", "#22d3ee", "#7dd3fc", "#a78bfa", "#818cf8"];

// Hand-written canvas particle system.
// - Particles spring toward a home formation (gravity, not tracking).
// - A slow cursor gently attracts + orbits nearby particles.
// - A fast cursor scatters them; they drift back to equilibrium.
// - Nearby particles reconnect with fading lines.
// - After a spell of no movement, they briefly spell "PERCH", then settle.
export default function ParticleField({ reduced, onWordMode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    const notify = (on) => onWordMode && onWordMode(on);
    let spelledOnce = false;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });
    let W = 0,
      H = 0,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    let wordPoints = null;

    const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0, last: performance.now() };
    let wordMode = false;
    let wordUntil = 0;

    const rand = (a, b) => a + Math.random() * (b - a);

    function layout() {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(90, Math.min(220, Math.round((W * H) / 4200)));
      particles = Array.from({ length: count }, () => {
        const hx = rand(0, W);
        const hy = rand(0, H);
        return {
          x: hx + rand(-40, 40),
          y: hy + rand(-40, 40),
          vx: 0,
          vy: 0,
          hx,
          hy,
          bx: hx, // base home (to restore after word mode)
          by: hy,
          r: rand(1.1, 2.4),
          color: PALETTE[(Math.random() * PALETTE.length) | 0],
        };
      });
      wordPoints = sampleWord("PERCH");
    }

    // Sample glyph pixels of a word into target points, scaled to the canvas.
    function sampleWord(text) {
      const off = document.createElement("canvas");
      const octx = off.getContext("2d");
      const fw = 900;
      const fh = 260;
      off.width = fw;
      off.height = fh;
      octx.fillStyle = "#fff";
      octx.font = "800 200px Inter, system-ui, sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(text, fw / 2, fh / 2);
      const data = octx.getImageData(0, 0, fw, fh).data;
      const pts = [];
      const step = 6;
      for (let y = 0; y < fh; y += step) {
        for (let x = 0; x < fw; x += step) {
          if (data[(y * fw + x) * 4 + 3] > 128) pts.push({ x: x / fw, y: y / fh });
        }
      }
      // Map normalized glyph points into a centered band of the canvas,
      // sitting a little below the headline. Shuffle so an even subset reads.
      const scale = Math.min(W * 0.54, 720);
      const bandH = scale * (fh / fw);
      const ox = W / 2 - scale / 2;
      const oy = H * 0.46 - bandH / 2;
      const mapped = pts.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * bandH }));
      for (let i = mapped.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
      }
      return mapped;
    }

    function assignWord(on) {
      if (on && wordPoints && wordPoints.length) {
        // spread particles evenly across the whole glyph outline
        particles.forEach((p, i) => {
          const t = wordPoints[Math.floor((i / particles.length) * wordPoints.length)];
          p.hx = t.x;
          p.hy = t.y;
        });
      } else {
        particles.forEach((p) => {
          p.hx = p.bx;
          p.hy = p.by;
        });
      }
    }

    const R = 170; // cursor influence radius
    const LINK = 128; // particle link distance
    const LINK2 = LINK * LINK;

    function frame(now) {
      // pointer speed (smoothed)
      const dx = mouse.x - mouse.px;
      const dy = mouse.y - mouse.py;
      const inst = Math.hypot(dx, dy);
      mouse.speed += (inst - mouse.speed) * 0.25;
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      // idle → briefly spell the word once, then release
      const idle = now - mouse.last;
      if (!wordMode && !spelledOnce && idle > 6500 && wordPoints) {
        wordMode = true;
        spelledOnce = true;
        wordUntil = now + 4000;
        assignWord(true);
        notify(true);
      } else if (wordMode && now > wordUntil) {
        wordMode = false;
        assignWord(false);
        notify(false);
      }

      ctx.clearRect(0, 0, W, H);
      const fast = mouse.speed > 9;
      const kHome = wordMode ? 0.045 : 0.012;

      for (const p of particles) {
        // spring home
        p.vx += (p.hx - p.x) * kHome;
        p.vy += (p.hy - p.y) * kHome;

        // cursor interaction
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const d2 = mdx * mdx + mdy * mdy;
        if (d2 < R * R && !wordMode) {
          const d = Math.sqrt(d2) || 0.001;
          const f = (1 - d / R);
          if (fast) {
            // scatter away, scaled by how fast the cursor is moving
            const push = f * Math.min(mouse.speed, 60) * 0.06;
            p.vx += (mdx / d) * push;
            p.vy += (mdy / d) * push;
          } else {
            // gentle orbit: pull in + perpendicular swirl
            p.vx += (-mdx / d) * f * 0.5 + (-mdy / d) * f * 0.35;
            p.vy += (-mdy / d) * f * 0.5 + (mdx / d) * f * 0.35;
          }
        }

        // damping + integrate
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;
      }

      // links (suppressed while spelling the word so letters stay legible)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < particles.length && !wordMode; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const lx = a.x - b.x;
          if (lx > LINK || lx < -LINK) continue;
          const ly = a.y - b.y;
          if (ly > LINK || ly < -LINK) continue;
          const l2 = lx * lx + ly * ly;
          if (l2 > LINK2) continue;
          const alpha = (1 - l2 / LINK2) * 0.22;
          ctx.strokeStyle = `rgba(125,211,252,${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // cursor halo links + particles
      for (const p of particles) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < R * R) {
          const a = (1 - Math.sqrt(md2) / R) * 0.4;
          ctx.strokeStyle = `rgba(52,211,153,${a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
        if (wordMode) {
          ctx.fillStyle = "#d4fff2";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.last = performance.now();
      if (wordMode) {
        wordMode = false;
        assignWord(false);
        notify(false);
      }
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    layout();
    let raf = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
