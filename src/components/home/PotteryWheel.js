import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FiRotateCcw } from 'react-icons/fi';
import useMotionPrefs from '../../hooks/useMotionPrefs';
import './PotteryWheel.css';

/**
 * Interactive potter's wheel. The pot is a lathe (surface of revolution):
 * a profile of radii from base to rim, drawn slice by slice with its own
 * cylindrical shading, plus "throwing lines" that travel around the form to
 * read as rotation. Press and drag across the clay to pull it in or out.
 *
 * Cost: one canvas, one rAF loop that runs only while the section is on
 * screen and the tab is visible. Reduced motion → no spin, still shapeable.
 */
const N = 56; // profile slices, base (0) → rim (N-1)

const PRESETS = {
  lump: (t) => 0.62 + 0.06 * Math.sin(t * Math.PI),
  vase: (t) => 0.5 + 0.42 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - t * 0.35) + (t > 0.82 ? (t - 0.82) * 1.4 : 0) - (t > 0.62 && t < 0.86 ? 0.28 * Math.sin(((t - 0.62) / 0.24) * Math.PI) : 0),
  bowl: (t) => 0.38 + 0.6 * Math.pow(t, 0.55),
  kulhad: (t) => 0.5 + 0.2 * t + 0.04 * Math.sin(t * Math.PI),
};
const PRESET_HEIGHT = { lump: 0.62, vase: 1, bowl: 0.48, kulhad: 0.56 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeProfile(name) {
  return Array.from({ length: N }, (_, i) => clamp(PRESETS[name](i / (N - 1)), 0.18, 1));
}

/** Classify the user's shape so we can point them to a matching category. */
function classify(profile, heightK) {
  const avg = profile.reduce((s, r) => s + r, 0) / profile.length;
  const neck = Math.min(...profile.slice(Math.floor(N * 0.55), N - 3));
  if (heightK < 0.6 && profile[N - 1] > profile[0] * 1.35) return 'Bowls';
  if (heightK < 0.7 && avg < 0.75) return 'Mugs & Cups';
  if (neck < avg * 0.8) return 'Vases';
  return heightK > 0.8 ? 'Vases' : 'Planters';
}

export default function PotteryWheel({ categories = [] }) {
  const { reducedMotion } = useMotionPrefs();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const profileRef = useRef(makeProfile('lump'));
  const targetRef = useRef(makeProfile('lump'));
  const heightRef = useRef({ cur: PRESET_HEIGHT.lump, target: PRESET_HEIGHT.lump });
  const pointerRef = useRef({ down: false, x: 0, y: 0 });
  const [shape, setShape] = useState('Vases');
  const [touched, setTouched] = useState(false);

  const setPreset = useCallback((name) => {
    targetRef.current = makeProfile(name);
    heightRef.current.target = PRESET_HEIGHT[name];
    setTouched(name !== 'lump');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let running = false;
    let inView = false;
    let t0 = performance.now();
    let lastClassify = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(280, rect.width);
      H = Math.round(Math.min(560, Math.max(360, W * 1.05)));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    // Geometry helpers (in CSS pixels)
    const geom = () => {
      const cx = W / 2;
      const maxR = Math.min(W * 0.36, 190);
      const baseY = H * 0.8;
      const potH = H * 0.6 * heightRef.current.cur;
      return { cx, maxR, baseY, potH, sliceH: potH / (N - 1), squash: 0.2 };
    };

    const sculpt = () => {
      const p = pointerRef.current;
      if (!p.down) return;
      const { cx, maxR, baseY, potH } = geom();
      const t = (baseY - p.y) / potH; // 0 at base, 1 at rim
      if (t < -0.05 || t > 1.08) return;
      const idx = clamp(Math.round(t * (N - 1)), 0, N - 1);
      const want = clamp(Math.abs(p.x - cx) / maxR, 0.16, 1);
      const target = targetRef.current;
      for (let i = 0; i < N; i += 1) {
        const w = Math.exp(-((i - idx) ** 2) / 18); // gaussian brush
        target[i] += (want - target[i]) * w * 0.35;
      }
      // keep the wall smooth: light neighbour averaging
      for (let i = 1; i < N - 1; i += 1) target[i] = target[i] * 0.8 + (target[i - 1] + target[i + 1]) * 0.1;
    };

    const draw = (now) => {
      const time = reducedMotion ? 0 : (now - t0) / 1000;
      const prof = profileRef.current;
      const tgt = targetRef.current;
      for (let i = 0; i < N; i += 1) prof[i] += (tgt[i] - prof[i]) * 0.18;
      heightRef.current.cur += (heightRef.current.target - heightRef.current.cur) * 0.12;

      const { cx, maxR, baseY, sliceH, squash } = geom();
      ctx.clearRect(0, 0, W, H);

      // Wheel head + its shadow
      const wheelR = maxR * 1.25;
      const sh = ctx.createRadialGradient(cx, baseY + 18, 10, cx, baseY + 18, wheelR * 1.2);
      sh.addColorStop(0, 'rgba(43,29,20,.28)');
      sh.addColorStop(1, 'rgba(43,29,20,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 22, wheelR * 1.15, wheelR * squash * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      const wg = ctx.createLinearGradient(cx - wheelR, 0, cx + wheelR, 0);
      wg.addColorStop(0, '#3a2a1f');
      wg.addColorStop(0.45, '#6b5545');
      wg.addColorStop(1, '#2b1d14');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 6, wheelR, wheelR * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      // rotating marks on the wheel head
      ctx.strokeStyle = 'rgba(250,245,239,.18)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k += 1) {
        const a = time * 2.4 + (k * Math.PI) / 3;
        if (Math.sin(a) < 0) continue;
        ctx.beginPath();
        ctx.ellipse(cx, baseY + 6, wheelR * 0.82, wheelR * squash * 0.82, 0, a - 0.12, a + 0.12);
        ctx.stroke();
      }

      // Pot body: draw slices from rim down so lower slices overlap correctly
      const xs = (i) => prof[i] * maxR;
      const ys = (i) => baseY - i * sliceH;
      for (let i = N - 2; i >= 0; i -= 1) {
        const r0 = xs(i);
        const r1 = xs(i + 1);
        const g = ctx.createLinearGradient(cx - Math.max(r0, r1), 0, cx + Math.max(r0, r1), 0);
        g.addColorStop(0, '#6e3517');
        g.addColorStop(0.28, '#c9845a');
        g.addColorStop(0.42, '#d99a72');
        g.addColorStop(0.75, '#9a4e27');
        g.addColorStop(1, '#5a2b13');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - r1, ys(i + 1));
        ctx.lineTo(cx + r1, ys(i + 1));
        ctx.ellipse(cx, ys(i), r0, r0 * squash, 0, 0, Math.PI, false); // front bottom edge
        ctx.closePath();
        ctx.fill();
      }

      // Throwing lines travelling around the form (reads as rotation)
      ctx.lineWidth = 1;
      for (let i = 2; i < N - 1; i += 3) {
        const r = xs(i);
        const y = ys(i);
        const a = time * 2.2 + i * 0.55;
        ctx.strokeStyle = `rgba(255,236,220,${0.1 + 0.08 * Math.sin(i)})`;
        ctx.beginPath();
        ctx.ellipse(cx, y, r * 0.995, r * squash, 0, Math.PI * 0.08, Math.PI * 0.92);
        ctx.stroke();
        // a highlight that slides across the front, like wet clay catching light
        const front = Math.sin(a);
        if (front > 0) {
          ctx.strokeStyle = `rgba(255,240,228,${0.35 * front})`;
          ctx.lineWidth = 2;
          const u = Math.cos(a) * 0.9; // -0.9 … 0.9 across the front
          const ang = Math.acos(clamp(u, -1, 1));
          ctx.beginPath();
          ctx.ellipse(cx, y, r, r * squash, 0, ang - 0.12, ang + 0.12);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      // Rim: opening with a dark interior
      const rTop = xs(N - 1);
      const yTop = ys(N - 1);
      const ig = ctx.createLinearGradient(cx - rTop, yTop, cx + rTop, yTop);
      ig.addColorStop(0, '#3b1a0b');
      ig.addColorStop(0.6, '#5c2a12');
      ig.addColorStop(1, '#2e1407');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(cx, yTop, rTop, rTop * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0a47e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, yTop, rTop, rTop * squash, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Finger marks where the potter is pressing
      const p = pointerRef.current;
      if (p.down) {
        ctx.fillStyle = 'rgba(250,245,239,.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      if (now - lastClassify > 400) {
        lastClassify = now;
        setShape(classify(targetRef.current, heightRef.current.target));
      }
    };

    const loop = (now) => {
      sculpt();
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      t0 = performance.now() - 1;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => (inView && document.visibilityState === 'visible' ? start() : stop());

    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.05 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      pointerRef.current.x = e.clientX - r.left;
      pointerRef.current.y = e.clientY - r.top;
    };
    const down = (e) => {
      pointerRef.current.down = true;
      local(e);
      canvas.setPointerCapture?.(e.pointerId);
      setTouched(true);
    };
    const move = (e) => local(e);
    const up = () => { pointerRef.current.down = false; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', up);
    };
  }, [reducedMotion]);

  const cat = categories.find((c) => c.name === shape);
  const shopLink = cat ? `/products?category=${cat._id}` : '/products';

  return (
    <section className="pw" aria-labelledby="pw-title">
      <div className="container pw-grid">
        <div className="pw-copy">
          <p className="hp-eyebrow">Try the wheel</p>
          <h2 id="pw-title" className="hp-title display">Throw your own <em>pot</em></h2>
          <p className="pw-text">
            Press and drag across the spinning clay to pull it in or push it out — the same way our potters shape every piece by hand.
            Every form you make is a little different. So is everything we sell.
          </p>
          <div className="pw-presets" role="group" aria-label="Start from a shape">
            {[['vase', 'Vase'], ['bowl', 'Bowl'], ['kulhad', 'Kulhad'], ['lump', 'Fresh clay']].map(([k, label]) => (
              <button key={k} type="button" className="pw-chip" onClick={() => setPreset(k)}>
                {k === 'lump' && <FiRotateCcw aria-hidden="true" />} {label}
              </button>
            ))}
          </div>
          <div className={`pw-result${touched ? ' is-visible' : ''}`} aria-live="polite">
            <span>Your shape looks like one of our</span>
            <Link to={shopLink} className="hp-link" data-magnetic>{shape} <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <div ref={wrapRef} className="pw-stage" data-cursor="Shape" data-cursor-style="outline">
          <canvas
            ref={canvasRef}
            className="pw-canvas"
            role="img"
            aria-label="Interactive clay pot on a potter's wheel. Drag on it to change its shape."
          />
          <p className="pw-hint" aria-hidden="true">{touched ? '' : 'Press & drag on the clay'}</p>
        </div>
      </div>
    </section>
  );
}
