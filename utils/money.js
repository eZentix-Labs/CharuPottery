/** Integer-paise helpers. Never do money maths in floating-point rupees. */

// Convert a rupee amount stored on legacy documents (e.g. 1199 or 1199.5) to paise.
const toPaise = (rupees) => {
  const n = Number(rupees);
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
};

const toRupees = (paise) => Math.round(paise) / 100;

// Basis-point percentage of a paise amount, rounded half-up to the nearest paisa.
const applyBps = (paise, bps) => Math.round((paise * bps) / 10000);

module.exports = { toPaise, toRupees, applyBps };
