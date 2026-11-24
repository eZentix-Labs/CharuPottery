import React, { useRef } from 'react';
import useMotionPrefs from '../../hooks/useMotionPrefs';

/**
 * 3D tilt wrapper: the child leans toward the pointer with a soft glare,
 * like turning a glazed piece in the light. Transform-only (GPU), one
 * rAF per pointer move, disabled for touch and reduced motion.
 */
export default function TiltCard({ children, max = 7, className = '', cursor = 'View' }) {
  const { reducedMotion, finePointer } = useMotionPrefs();
  const ref = useRef(null);
  const frame = useRef(0);
  const active = finePointer && !reducedMotion;

  const onMove = (e) => {
    if (!active) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--rx', `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty('--gx', `${px * 100}%`);
      el.style.setProperty('--gy', `${py * 100}%`);
      el.classList.add('is-tilting');
    });
  };
  const onLeave = () => {
    const el = ref.current;
    cancelAnimationFrame(frame.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.classList.remove('is-tilting');
  };

  return (
    <div className={`tilt ${className}`} data-cursor={cursor}>
      <div ref={ref} className="tilt-inner" onPointerMove={onMove} onPointerLeave={onLeave}>
        {children}
        <span className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
