import React, { useState } from 'react';
import './PrimeReveal.css';

/**
 * Lightweight "entertainment" for the Prime Collection reward (CP-CUST-040):
 * a tap-to-reveal gift card. Purely presentational — the reward itself is
 * decided and recorded on the server. The exact entertainment is pending
 * client confirmation (DEC-11); this keeps it simple, accessible and
 * dependency-free.
 */
export default function PrimeReveal() {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`prime-reveal${open ? ' open' : ''}`}
      onClick={() => setOpen(true)}
      aria-pressed={open}
      aria-label={open ? 'Your Prime Collection gift is revealed' : 'Tap to reveal your Prime Collection gift'}
    >
      <span className="prime-reveal-front">🎁 Tap to reveal your Prime gift</span>
      <span className="prime-reveal-back">A handmade surprise from our studio is packed with your order. Thank you for being a Prime Collection customer!</span>
    </button>
  );
}
