const mongoose = require('mongoose');

/**
 * Order model.
 *
 * Fulfilment state lives in `orderStatus`; payment state lives in
 * `payment.status`. They are deliberately separate: a COD order can be
 * Delivered while its payment is still PAYMENT_PENDING (cash not yet
 * confirmed by an authorised user).
 *
 * Legacy rupee fields (itemsPrice, totalPrice, isPaid …) are kept for older
 * screens. They are derived from the authoritative integer-paise `pricing`
 * block and `payment.status`, and are only ever written by the server.
 */

const ORDER_STATUSES = [
  'AwaitingPayment', // online payment initiated, stock reserved, not yet paid
  'Pending',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
  'Expired', // online payment never completed within the reservation window
];

const PAYMENT_STATUSES = [
  'PAYMENT_PENDING',
  'PAID',
  'FAILED',
  'VOIDED', // order cancelled/expired before any money was taken
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
];

const PAYMENT_PROVIDERS = ['COD', 'PHONEPE'];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true }, // legacy: unit price in rupees
    unitPricePaise: { type: Number, min: 0 },
    lineTotalPaise: { type: Number, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const refundSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['NONE', 'PENDING', 'SUCCEEDED', 'FAILED'], default: 'NONE' },
    amountPaise: Number,
    reason: String,
    merchantRefundId: String, // our id sent to the gateway (PhonePe)
    providerRefundId: String,
    reference: String, // manual refund reference (COD: bank/UPI txn ref)
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    failureReason: String,
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'PAYMENT_PENDING' },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    // Online gateway identifiers (PhonePe)
    merchantOrderId: String,
    providerOrderId: String,
    transactionId: String,
    paymentMode: String,
    redirectUrl: String,

    paidAt: Date,

    // COD cash collection — recorded only by an authorised user
    codCollection: {
      collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      collectedAt: Date,
      amountPaise: Number,
      note: String,
    },

    refund: { type: refundSchema, default: () => ({}) },

    // Set when the gateway reports something that doesn't match the order
    needsReview: { type: Boolean, default: false },
    reviewReason: String,
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    itemsPaise: { type: Number, required: true, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },
    shippingPaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },
    taxRateBasisPoints: Number,
    couponCode: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderItems: {
      type: [orderItemSchema],
      validate: [(arr) => arr.length > 0, 'Order must contain at least one item'],
    },
    shippingAddress: { type: shippingAddressSchema, required: true },

    // Legacy values are kept so that historical orders still validate.
    paymentMethod: {
      type: String,
      enum: ['Card', 'Stripe', 'COD', 'UPI', 'PhonePe'],
      required: true,
    },
    paymentResult: { id: String, status: String, update_time: String, email_address: String },

    // Legacy rupee totals (derived from `pricing`)
    itemsPrice: { type: Number, required: true, default: 0 },
    shippingPrice: { type: Number, required: true, default: 0 },
    taxPrice: { type: Number, required: true, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },

    pricing: pricingSchema,
    payment: paymentSchema,

    isPaid: { type: Boolean, default: false },
    paidAt: Date,

    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'Pending' },
    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        note: String,
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actorRole: String,
      },
    ],

    // Idempotency for checkout (unique per user, see index below)
    idempotencyKey: String,
    requestFingerprint: String,

    // Online reservations only. COD orders never set this.
    reservationExpiresAt: Date,

    // Where the order came from (DEC-14): captured going forward only.
    source: {
      channel: { type: String, default: 'web' },
      utmSource: String,
      utmMedium: String,
      utmCampaign: String,
      referrer: String,
    },

    // Prime Collection reward applied to this order
    primeReward: {
      applied: { type: Boolean, default: false },
      rewardNumber: Number,
      giftNote: String,
    },

    trackingNumber: String,
    carrier: String,
    isDelivered: { type: Boolean, default: false },
    deliveredAt: Date,

    cancelReason: String,
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
orderSchema.index(
  { 'payment.merchantOrderId': 1 },
  { unique: true, partialFilterExpression: { 'payment.merchantOrderId': { $type: 'string' } } }
);
orderSchema.index({ orderStatus: 1, reservationExpiresAt: 1 });
orderSchema.index({ 'payment.status': 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

orderSchema.statics.ORDER_STATUSES = ORDER_STATUSES;
orderSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;
orderSchema.statics.PAYMENT_PROVIDERS = PAYMENT_PROVIDERS;

module.exports = mongoose.model('Order', orderSchema);
