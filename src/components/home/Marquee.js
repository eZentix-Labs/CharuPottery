import React, { useEffect, useRef } from 'react';
import useMotionPrefs from '../../hooks/useMotionPrefs';

/**
 * Two rows of words drifting in opposite directions. Scrolling the page
 * speeds them up (scroll velocity), then they ease back to a slow drift.
 * Runs only while visible; static for reduced motion.
 */
export default function Marquee({ words }) {
  const { reducedMotion } = useMotionPrefs();
  const rowA = useRef(null);
  const rowB = useRef(null);
  const wrap = useRef(null);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let raf = 0;
    let x = 0;
    let boost = 0;
    let lastY = window.scrollY;
    let visible = false;

    const onScroll = () => {
      const y = window.scrollY;
      boost = Math.min(18, boost + Math.abs(y - lastY) * 0.06);
      lastY = y;
    };
    const tick = () => {
      boost *= 0.92;
      x += 0.35 + boost;
      const wA = rowA.current.scrollWidth / 3; // one copy of the words
      const offset = wA ? x % wA : 0;
      rowA.current.style.transform = `translate3d(${-offset}px,0,0)`;
      rowB.current.style.transform = `translate3d(${offset - wA}px,0,0)`;
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(tick);
    });
    io.observe(wrap.current);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reducedMotion]);

  const row = [...words, ...words, ...words]; // 3 copies → seamless loop on wide screens
  return (
    <div ref={wrap} className="mq" aria-label={words.join(', ')} role="img">
      <div ref={rowA} className="mq-row display">
        {row.map((w, i) => <span key={`a${i}`}>{w}<i aria-hidden="true">✦</i></span>)}
      </div>
      <div ref={rowB} className="mq-row mq-row-alt display">
        {row.map((w, i) => <span key={`b${i}`}>{w}<i aria-hidden="true">✦</i></span>)}
      </div>
    </div>
  );
}
