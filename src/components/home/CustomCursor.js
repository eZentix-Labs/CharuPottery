import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useMotionPrefs from '../../hooks/useMotionPrefs';
import './CustomCursor.css';

/**
 * "Potter's wheel" cursor for the storefront.
 *
 *  - A small clay dot follows the pointer exactly.
 *  - A dashed ring trails behind it and spins slowly, like a wheel head.
 *  - Over links/buttons the ring opens up; over elements with
 *    data-cursor="View|Shape|Copy|…" it becomes a cream disc with that word.
 *  - Pressing squashes it, like pressing into wet clay.
 *  - Elements with data-magnetic drift gently toward the pointer.
 *
 * Enabled only for hover-capable fine pointers without reduced-motion, so
 * touch devices and accessibility settings keep the native cursor. Text
 * fields always keep the native I-beam.
 */
const INTERACTIVE = 'a, button, [role="button"], label, select, summary, [data-cursor]';
const TEXT_INPUT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

export default function CustomCursor() {
  const { reducedMotion, finePointer } = useMotionPrefs();
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const labelRef = useRef(null);
  const { pathname } = useLocation();
  const enabled = finePointer && !reducedMotion;

  useEffect(() => {
    if (!enabled) return undefined;
    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    document.documentElement.classList.add('has-wheel-cursor');

    const pos = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let raf = 0;
    let visible = false;
    let magnet = null;

    const setState = (target) => {
      if (target?.closest?.(TEXT_INPUT)) {
        ring.dataset.state = 'text';
        return;
      }
      const el = target?.closest?.(INTERACTIVE);
      const labelled = el?.closest('[data-cursor]');
      // A button inside a labelled area (e.g. "Add to cart" in a product card)
      // keeps the normal hover state instead of the area's label.
      const useLabel = labelled && (labelled === el || el.tagName !== 'BUTTON');
      const word = useLabel ? labelled.getAttribute('data-cursor') : null;
      if (word) {
        // "outline" keeps the area under the pointer visible (e.g. the clay wheel)
        ring.dataset.state = labelled.getAttribute('data-cursor-style') === 'outline' ? 'outline' : 'label';
        label.textContent = word;
      } else if (el) {
        ring.dataset.state = 'hover';
      } else {
        ring.dataset.state = 'idle';
      }
      const m = target?.closest?.('[data-magnetic]') || null;
      if (magnet && magnet !== m) magnet.style.transform = '';
      magnet = m;
    };

    const onMove = (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!visible) {
        visible = true;
        ringPos.x = pos.x;
        ringPos.y = pos.y;
        dot.style.opacity = '1';
        ring.style.opacity = '1';
      }
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const dx = (pos.x - (r.left + r.width / 2)) * 0.18;
        const dy = (pos.y - (r.top + r.height / 2)) * 0.28;
        magnet.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    };
    const onOver = (e) => setState(e.target);
    const onLeave = () => {
      visible = false;
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };
    const onDown = () => ring.classList.add('is-pressed');
    const onUp = () => ring.classList.remove('is-pressed');

    const tick = () => {
      // Critically damped follow: the ring lags a little behind the dot.
      ringPos.x += (pos.x - ringPos.x) * 0.2;
      ringPos.y += (pos.y - ringPos.y) * 0.2;
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      if (magnet) magnet.style.transform = '';
      document.documentElement.classList.remove('has-wheel-cursor');
    };
  }, [enabled]);

  // Reset the state after navigation (the hovered element may be gone).
  useEffect(() => {
    if (ringRef.current) ringRef.current.dataset.state = 'idle';
  }, [pathname]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ringRef} className="wheel-cursor-ring" data-state="idle" aria-hidden="true">
        <span className="wheel-cursor-spin" />
        <span ref={labelRef} className="wheel-cursor-label" />
      </div>
      <div ref={dotRef} className="wheel-cursor-dot" aria-hidden="true" />
    </>
  );
}
