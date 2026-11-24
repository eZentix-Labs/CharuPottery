const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const PaymentTransaction = require('../models/PaymentTransaction');
const AuditLog = require('../models/AuditLog');
const InventoryMovement = require('../models/InventoryMovement');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/pagination');
const orderService = require('../services/orderService');
const sm = require('../services/orderStateMachine');

// Fields a customer may see about their own order (no internal review notes,
// no idempotency data, no raw provider payloads).
function customerView(order) {
  const o = order.toObject ? order.toObject() : order;
  delete o.idempotencyKey;
  delete o.requestFingerprint;
  if (o.payment) {
    delete o.payment.needsReview;
    delete o.payment.reviewReason;
    if (o.payment.codCollection) delete o.payment.codCollection.collectedBy;
    if (o.payment.refund) {
      delete o.payment.refund.requestedBy;
      delete o.payment.refund.confirmedBy;
    }
  }
  o.canCancel = sm.CANCELLABLE_STATUSES.includes(o.orderStatus);
  return o;
}

const assertId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError('Order not found.', 404);
};

// @route GET /api/v1/orders/checkout/quote   (customer)
exports.getQuote = asyncHandler(async (req, res) => {
  const data = await orderService.quote(req.user, { couponCode: req.query.couponCode });
  res.status(200).json({ success: true, data });
});

// @route POST /api/v1/orders/checkout   (customer) — also mounted at POST /orders
exports.checkout = asyncHandler(async (req, res) => {
  const { order, replayed } = await orderService.checkout(
    req.user,
    {
      idempotencyKey: req.get('Idempotency-Key'),
      shippingAddress: req.body.shippingAddress,
      paymentMethod: req.body.paymentMethod,
      couponCode: req.body.couponCode,
      expectedTotalPaise: req.body.expectedTotalPaise,
      applyPrimeReward: req.body.applyPrimeReward === true,
      source: req.body.source,
      // NOTE: paymentResult / isPaid / prices from the client are ignored.
    },
    req
  );
  res.status(replayed ? 200 : 201).json({
    success: true,
    replayed,
    data: customerView(order),
    payment: {
      provider: order.payment.provider,
      status: order.payment.status,
      redirectUrl: order.payment.provider === 'PHONEPE' ? order.payment.redirectUrl : undefined,
    },
  });
});

// @route GET /api/v1/orders/my-orders
exports.getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 20, max: 50 });
  const filter = { user: req.user._id };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: orders.length, total, page, pages: Math.ceil(total / limit), data: orders.map(customerView) });
});

// @route GET /api/v1/orders/:id  (owner or admin)
exports.getOrder = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) throw new ApiError('Order not found.', 404);
  const isAdmin = req.user.role === 'admin';
  if (String(order.user._id) !== String(req.user._id) && !isAdmin) {
    throw new ApiError('Not authorized to view this order.', 403);
  }
  res.status(200).json({ success: true, data: isAdmin ? order : customerView(order) });
});

// @route POST|PUT /api/v1/orders/:id/cancel  (owner)
exports.cancelOrder = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.cancelOrder({ orderId: req.params.id, actor: req.user, reason: req.body?.reason, req });
  res.status(200).json({ success: true, data: customerView(order) });
});

// @route POST /api/v1/orders/:id/payment/verify  (owner) — after returning from the gateway
exports.verifyPayment = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const existing = await Order.findById(req.params.id).select('user');
  if (!existing || String(existing.user) !== String(req.user._id)) throw new ApiError('Order not found.', 404);
  const order = await orderService.verifyOnlinePayment(req.params.id, { source: 'customer_return' });
  res.status(200).json({ success: true, data: customerView(order) });
});

// @route POST /api/v1/orders/:id/payment/initiate  (owner) — retry starting an online payment
exports.initiatePayment = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user._id)) throw new ApiError('Order not found.', 404);
  if (order.orderStatus !== 'AwaitingPayment' || order.payment?.provider === 'COD') {
    throw new ApiError('This order is not awaiting an online payment.', 400);
  }
  const updated = await orderService.initiateOnlinePayment(order);
  res.status(200).json({ success: true, data: customerView(updated), payment: { redirectUrl: updated.payment.redirectUrl } });
});

// ─── ADMIN ────────────────────────────────────────────────────────────────

// @route GET /api/v1/orders  (admin) — filters: status, paymentStatus, provider, q, from, to
exports.getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 20, max: 100 });
  const filter = {};
  if (req.query.status && Order.ORDER_STATUSES.includes(req.query.status)) filter.orderStatus = req.query.status;
  if (req.query.paymentStatus && Order.PAYMENT_STATUSES.includes(req.query.paymentStatus)) filter['payment.status'] = req.query.paymentStatus;
  if (req.query.provider && Order.PAYMENT_PROVIDERS.includes(req.query.provider)) filter['payment.provider'] = req.query.provider;
  if (req.query.needsReview === 'true') filter['payment.needsReview'] = true;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (req.query.from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    if (req.query.to && !Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
  }
  if (req.query.q && typeof req.query.q === 'string') {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').limit(200);
    filter.$or = [{ orderNumber: rx }, { 'shippingAddress.fullName': rx }, { 'shippingAddress.phone': rx }, { user: { $in: users.map((u) => u._id) } }];
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).populate('user', 'name email').sort('-createdAt').skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: orders.length, total, page, pages: Math.ceil(total / limit), data: orders });
});

// @route PUT /api/v1/orders/:id/status  (admin) — fulfilment only
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const { orderStatus, trackingNumber, carrier, note } = req.body;
  const order = await orderService.adminUpdateStatus({ orderId: req.params.id, actor: req.user, orderStatus, trackingNumber, carrier, note, req });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/admin-cancel
exports.adminCancel = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.cancelOrder({ orderId: req.params.id, actor: req.user, reason: req.body?.reason, asAdmin: true, req });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/cod/collect  { amountPaise, note }
exports.confirmCodCollection = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.confirmCodCollection({ orderId: req.params.id, actor: req.user, amountPaise: req.body.amountPaise, note: req.body.note, req });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/refund  { reason, restock }
exports.adminRefund = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.adminRefund({ orderId: req.params.id, actor: req.user, reason: req.body.reason, restock: req.body.restock === true, req });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/refund/retry
exports.retryRefund = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.retryRefund({ orderId: req.params.id, actor: req.user, req });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/refund/reconcile
exports.reconcileRefund = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const result = await orderService.reconcileRefund(req.params.id);
  const order = result.order || result;
  res.status(200).json({ success: true, data: order, pending: !!result.pending, notFound: !!result.notFound });
});

// @route POST /api/v1/orders/:id/payment/reconcile  (admin) — re-check an online payment
exports.reconcilePayment = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.verifyOnlinePayment(req.params.id, { source: 'admin_reconcile' });
  res.status(200).json({ success: true, data: order });
});

// @route POST /api/v1/orders/:id/refund/manual  { outcome: SUCCEEDED|FAILED, reference, note }
exports.recordManualRefund = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const order = await orderService.recordManualRefund({ orderId: req.params.id, actor: req.user, outcome: req.body.outcome, reference: req.body.reference, note: req.body.note, req });
  res.status(200).json({ success: true, data: order });
});

// @route GET /api/v1/orders/:id/history  (admin) — payments, stock moves and audit
exports.getOrderHistory = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const id = req.params.id;
  const [payments, movements, audits] = await Promise.all([
    PaymentTransaction.find({ order: id }).sort('createdAt').populate('actor', 'name'),
    InventoryMovement.find({ order: id }).sort('createdAt').populate('item', 'name'),
    AuditLog.find({ entity: 'Order', entityId: id }).sort('createdAt').populate('actor', 'name'),
  ]);
  res.status(200).json({ success: true, data: { payments, movements, audits } });
});

// @route GET /api/v1/orders/analytics/summary  (admin)
// Revenue counts only money actually received: online payments confirmed by
// the provider and COD cash recorded as collected. Unpaid COD is excluded.
exports.getSalesAnalytics = asyncHandler(async (req, res) => {
  const amount = { $ifNull: ['$pricing.totalPaise', { $round: [{ $multiply: ['$totalPrice', 100] }, 0] }] };
  const [byPayment, statusCounts, legacyUnverified] = await Promise.all([
    Order.aggregate([
      { $match: { payment: { $exists: true } } },
      { $group: { _id: '$payment.status', count: { $sum: 1 }, amountPaise: { $sum: amount } } },
    ]),
    Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    Order.countDocuments({ payment: { $exists: false }, isPaid: true, paymentMethod: { $ne: 'COD' } }),
  ]);
  const get = (s) => byPayment.find((b) => b._id === s) || { count: 0, amountPaise: 0 };
  const paid = get('PAID');
  const refundPending = get('REFUND_PENDING');
  const refundFailed = get('REFUND_FAILED');
  const refunded = get('REFUNDED');
  const pending = get('PAYMENT_PENDING');
  const collectedPaise = paid.amountPaise + refundPending.amountPaise + refundFailed.amountPaise;
  res.status(200).json({
    success: true,
    data: {
      currency: 'INR',
      collectedRevenuePaise: collectedPaise,
      netRevenuePaise: paid.amountPaise,
      refundsOutstandingPaise: refundPending.amountPaise + refundFailed.amountPaise,
      refundedPaise: refunded.amountPaise,
      paidOrders: paid.count,
      awaitingPaymentOrders: pending.count,
      awaitingPaymentPaise: pending.amountPaise,
      avgPaidOrderValuePaise: paid.count ? Math.round(paid.amountPaise / paid.count) : 0,
      // Back-compat for the existing dashboard (rupees, verified money only)
      totalRevenue: paid.amountPaise / 100,
      totalOrders: paid.count,
      avgOrderValue: paid.count ? paid.amountPaise / paid.count / 100 : 0,
      statusCounts,
      legacyUnverifiedPaidOrders: legacyUnverified,
      notes: [
        'Revenue includes only provider-confirmed online payments and COD cash recorded as collected.',
        'Orders created before the payment upgrade are excluded from revenue (legacyUnverifiedPaidOrders: DEC-17).',
      ],
    },
  });
});
