const mongoose = require('mongoose');

/**
 * Prime Collection reward ledger (append-only).
 *   REDEEM  — a reward was applied to an order (one per order, unique)
 *   REVERSE — that redemption was given back because the order was cancelled
 *             or expired (one per order, unique)
 * Earned rewards are not stored: they are recomputed from qualifying orders,
 * so a later refund automatically reduces what is available.
 */
const loyaltyLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['REDEEM', 'REVERSE'], required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rewardNumber: Number,
    qualifyingCountAtTime: Number,
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loyaltyLedgerSchema.index({ order: 1, type: 1 }, { unique: true });
loyaltyLedgerSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('LoyaltyLedger', loyaltyLedgerSchema);
