/**
 * Single source of truth for commercial rules that affect totals.
 *
 * Values marked PROVISIONAL are carried over from the previous code and are
 * waiting on client confirmation (see docs/charu-pottery/client-decisions.md):
 *   - DEC-04 shipping charges
 *   - DEC-05 GST rate / whether prices include tax
 *   - DEC-11 Prime Collection qualifying-purchase rule
 *
 * All money is integer paise (₹1 = 100 paise).
 */
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

module.exports = {
  currency: 'INR',

  // PROVISIONAL (DEC-05): 5% tax added on top of the discounted item total.
  taxRateBasisPoints: int(process.env.TAX_RATE_BPS, 500), // 500 bps = 5%

  // PROVISIONAL (DEC-04): ₹99 flat, free when items total is above ₹2000.
  shippingFlatPaise: int(process.env.SHIPPING_FLAT_PAISE, 9900),
  freeShippingAbovePaise: int(process.env.FREE_SHIPPING_ABOVE_PAISE, 200000),

  maxQuantityPerLine: int(process.env.MAX_QTY_PER_LINE, 20),
  maxLinesPerOrder: int(process.env.MAX_LINES_PER_ORDER, 30),

  // DEC-03: unpaid online-payment reservations are held for 30 minutes.
  // COD orders never use this timer (their stock is sold at placement).
  onlineReservationMinutes: int(process.env.ONLINE_RESERVATION_MINUTES, 30),

  // Prime Collection (CP-CUST-040, DEC-11 — PENDING CLIENT CONFIRMATION).
  prime: {
    purchasesPerReward: int(process.env.PRIME_PURCHASES_PER_REWARD, 5),
    // Default rule: an order qualifies once it is Delivered AND paid AND not
    // refunded. Cancelled / refunded / expired orders never qualify.
    qualifyingOrderStatuses: ['Delivered'],
    qualifyingPaymentStatuses: ['PAID'],
    minOrderPaise: int(process.env.PRIME_MIN_ORDER_PAISE, 0),
  },
};
