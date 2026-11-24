/**
 * LEGACY STRIPE — DISABLED.
 *
 * The previous checkout marked every non-COD order as paid without taking a
 * payment, and the Stripe webhook only logged events. The platform now uses
 * COD (active) and PhonePe (prepared, disabled). The original Stripe code is
 * kept, unused, in this folder (`*.original.js`) until the owner decides its
 * disposition (see docs/charu-pottery/client-decisions.md, DEC-20).
 *
 * The old webhook URL answers 410 so a still-configured Stripe endpoint fails
 * visibly instead of being silently accepted.
 */
exports.legacyStripeWebhookGone = (req, res) => {
  res.status(410).json({ success: false, message: 'Stripe payments are disabled on this store.' });
};
