import React, { useEffect, useRef, useState } from 'react';
import useMotionPrefs from '../../hooks/useMotionPrefs';

/**
 * "From clay to kiln" — a pinned section whose panels slide horizontally
 * as you scroll down (desktop). Each panel's photo has inner parallax.
 * Phones get the same scroll-linked effect with a shorter scroll distance
 * per step (layout in styles/mobile.css). With reduced motion it falls back
 * to a static list (a swipe strip on phones), so nothing is hidden.
 */
export default function ScrollProcess({ steps }) {
  const { reducedMotion } = useMotionPrefs();
  const outer = useRef(null);
  const track = useRef(null);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth > 900);
  const pinned = !reducedMotion;
  const vhPerStep = wide ? 70 : 55;

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth > 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!pinned) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const o = outer.current;
      const t = track.current;
      if (!o || !t) return;
      const rect = o.getBoundingClientRect();
      const scrollable = o.offsetHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, -rect.top / scrollable));
      const distance = t.scrollWidth - window.innerWidth;
      t.style.transform = `translate3d(${-p * distance}px,0,0)`;
      t.style.setProperty('--p', p.toFixed(4));
      o.style.setProperty('--p', p.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pinned, steps.length]);

  return (
    <section
      ref={outer}
      className={`sp${pinned ? ' is-pinned' : ''}`}
      style={pinned ? { height: `${100 + steps.length * vhPerStep}vh` } : undefined}
      aria-labelledby="sp-title"
    >
      <div className="sp-sticky">
        <div className="sp-head container">
          <p className="hp-eyebrow hp-eyebrow-light">How every piece is made</p>
          <h2 id="sp-title" className="hp-title display">From clay <em>to kiln</em></h2>
          {pinned && <div className="sp-bar" aria-hidden="true"><span /></div>}
        </div>
        <ol ref={track} className="sp-track">
          {steps.map((s, i) => (
            <li key={s.n} className="sp-panel" style={{ '--i': i }}>
              <div className="sp-media">
                <img src={s.img} alt={s.alt} loading="lazy" />
              </div>
              <div className="sp-text">
                <span className="sp-n display">{s.n}</span>
                <h3 className="display">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
