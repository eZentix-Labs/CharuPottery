import { useEffect, useState } from 'react';

const mq = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/**
 * Motion / input capabilities used to decide which effects to enable.
 *  - reducedMotion: user asked the OS for less motion → keep the page still
 *  - finePointer:   a mouse/trackpad that can hover → custom cursor & tilt
 */
export default function useMotionPrefs() {
  const [prefs, setPrefs] = useState(() => ({
    reducedMotion: !!mq('(prefers-reduced-motion: reduce)')?.matches,
    finePointer: !!mq('(hover: hover) and (pointer: fine)')?.matches,
  }));

  useEffect(() => {
    const a = mq('(prefers-reduced-motion: reduce)');
    const b = mq('(hover: hover) and (pointer: fine)');
    if (!a || !b) return undefined;
    const update = () => setPrefs({ reducedMotion: a.matches, finePointer: b.matches });
    a.addEventListener?.('change', update);
    b.addEventListener?.('change', update);
    return () => {
      a.removeEventListener?.('change', update);
      b.removeEventListener?.('change', update);
    };
  }, []);

  return prefs;
}
