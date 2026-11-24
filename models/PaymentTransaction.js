const mongoose = require('mongoose');

/**
 * Auditable history of every payment-related interaction with a provider or a
 * person: initiation, status checks, callbacks, COD collection, refunds.
 * Raw provider payloads are stored only after removing sensitive fields.
 */
const paymentTransactionSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    provider: { type: String, enum: ['COD', 'PHONEPE', 'STRIPE_LEGACY'], required: true },
    kind: {
      type: String,
      enum: [
        'INITIATE',
        'STATUS_CHECK',
        'CALLBACK',
        'COD_COLLECTED',
        'REFUND_INITIATE',
        'REFUND_STATUS',
        'REFUND_MANUAL',
        'RECONCILE',
      ],
      required: true,
    },
    outcome: { type: String }, // provider state or our decision, e.g. COMPLETED, FAILED, MISMATCH
    amountPaise: Number,
    merchantOrderId: String,
    providerOrderId: String,
    transactionId: String,
    merchantRefundId: String,
    // Dedupe key for callbacks (provider event identity); unique when present.
    eventKey: String,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

paymentTransactionSchema.index({ order: 1, createdAt: -1 });
paymentTransactionSchema.index(
  { eventKey: 1 },
  { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } }
);

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
