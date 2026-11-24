const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const InventoryMovement = require('../models/InventoryMovement');
const PaymentTransaction = require('../models/PaymentTransaction');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { withTransaction } = require('../utils/withTransaction');
const { toRupees } = require('../utils/money');
const commerce = require('../config/commerce');
const { phonepeConfig, codEnabled } = require('../config/payments');
const { getOnlineProvider } = require('./payments');
const pricing = require('./pricing');
const inventory = require('./inventory');
const loyalty = require('./loyalty');
const { audit } = require('./audit');
const notifications = require('./notifications');
const sm = require('./orderStateMachine');

// ─── helpers ──────────────────────────────────────────────────────────────

const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateOrderNumber(now = new Date()) {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
  let rand = '';
  for (let i = 0; i < 6; i += 1) rand += BASE32[crypto.randomInt(BASE32.length)];
  return `CP-${ymd}-${rand}`;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;

function normalizeMethod(m) {
  const v = String(m || '').trim().toUpperCase();
  if (v === 'COD') return 'COD';
  if (v === 'PHONEPE') return 'PHONEPE';
  return null;
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function validateShippingAddress(a) {
  const errors = {};
  const addr = {
    fullName: clean(a?.fullName, 80),
    street: clean(a?.street, 200),
    city: clean(a?.city, 60),
    state: clean(a?.state, 60),
    postalCode: clean(String(a?.postalCode ?? ''), 12),
    country: clean(a?.country || 'India', 56),
    phone: clean(String(a?.phone ?? ''), 20).replace(/[\s-]/g, ''),
  };
  if (addr.fullName.length < 2) errors.fullName = 'Full name is required';
  if (addr.street.length < 5) errors.street = 'Street address is required';
  if (addr.city.length < 2) errors.city = 'City is required';
  if (addr.state.length < 2) errors.state = 'State is required';
  if (addr.country.toLowerCase() === 'india') {
    if (!/^[1-9][0-9]{5}$/.test(addr.postalCode)) errors.postalCode = 'Enter a valid 6-digit PIN code';
    if (!/^(\+91)?[6-9][0-9]{9}$/.test(addr.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
  } else {
    if (addr.postalCode.length < 3) errors.postalCode = 'Postal code is required';
    if (!/^\+?[0-9]{7,15}$/.test(addr.phone)) errors.phone = 'Enter a valid phone number';
  }
  if (Object.keys(errors).length) {
    throw new ApiError('Please check the shipping address.', 400, { code: 'INVALID_ADDRESS', details: errors });
  }
  return addr;
}

function fingerprint(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function history(status, note, actor) {
  return { status, note, changedAt: new Date(), actor: actor?._id, actorRole: actor?.role || 'system' };
}

async function recordTxn(doc, session) {
  try {
    if (session) await PaymentTransaction.create([doc], { session });
    else await PaymentTransaction.create(doc);
  } catch (err) {
    if (err.code === 11000) return false; // duplicate eventKey → already recorded
    throw err;
  }
  return true;
}

function checkoutView(order) {
  return order;
}

// ─── quote ────────────────────────────────────────────────────────────────

async function quote(user, { couponCode } = {}) {
  const cart = await Cart.findOne({ user: user._id });
  const items = cart?.items || [];
  const q = await pricing.priceItems(items, { couponCode: couponCode ?? cart?.couponCode, userId: user._id });
  const prime = await loyalty.getStatus(user._id);
  return { ...pricing.publicQuote(q), prime: { rewardsAvailable: prime.rewardsAvailable } };
}

// ─── checkout ─────────────────────────────────────────────────────────────

/**
 * Create an order from the user's cart.
 *  - Idempotent per (user, Idempotency-Key): a replay returns the same order.
 *  - Prices are recomputed on the server; if the total differs from the
 *    total the customer confirmed (expectedTotalPaise) → 409 PRICE_CHANGED.
 *  - Stock is taken atomically in a transaction with ledger rows:
 *      COD     → SALE (sold at placement; no expiry timer)
 *      PHONEPE → RESERVE for 30 min (released on failure/expiry)
 *  - Payment is never marked paid here.
 */
async function checkout(user, input, req) {
  const idempotencyKey = input.idempotencyKey;
  if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    throw new ApiError('A valid Idempotency-Key header is required (16–100 characters: letters, digits, - or _).', 400, { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  const method = normalizeMethod(input.paymentMethod);
  if (!method) {
    throw new ApiError('Unsupported payment method. Cash on Delivery is currently available.', 400, { code: 'PAYMENT_METHOD_UNSUPPORTED' });
  }
  if (method === 'COD' && !codEnabled()) throw new ApiError('Cash on Delivery is currently unavailable.', 400, { code: 'PAYMENT_METHOD_DISABLED' });
  if (method === 'PHONEPE' && !phonepeConfig().enabled) {
    throw new ApiError('Online payment is not available yet. Please choose Cash on Delivery.', 400, { code: 'PAYMENT_METHOD_DISABLED' });
  }

  const shippingAddress = validateShippingAddress(input.shippingAddress);
  const couponCode = input.couponCode ? String(input.couponCode).trim().toUpperCase().slice(0, 30) : null;
  const applyPrimeReward = input.applyPrimeReward === true;
  const fp = fingerprint({ method, shippingAddress, couponCode, applyPrimeReward });

  const existing = await Order.findOne({ user: user._id, idempotencyKey });
  if (existing) return replay(existing, fp);

  const expected = input.expectedTotalPaise;
  if (!Number.isInteger(expected) || expected < 0) {
    throw new ApiError('expectedTotalPaise (the total shown to the customer) is required.', 400, { code: 'EXPECTED_TOTAL_REQUIRED' });
  }

  const cart = await Cart.findOne({ user: user._id });
  if (!cart || cart.items.length === 0) throw new ApiError('Your cart is empty.', 400, { code: 'CART_EMPTY' });

  const orderId = new mongoose.Types.ObjectId();
  const source = {
    channel: clean(input.source?.channel, 30) || 'web',
    utmSource: clean(input.source?.utmSource, 60) || undefined,
    utmMedium: clean(input.source?.utmMedium, 60) || undefined,
    utmCampaign: clean(input.source?.utmCampaign, 80) || undefined,
    referrer: clean(input.source?.referrer, 200) || undefined,
  };

  let order;
  try {
    order = await withTransaction(async (session) => {
      const q = await pricing.priceItems(cart.items, { couponCode, userId: user._id, session });
      if (q.problems.length) {
        throw new ApiError(q.problems[0].message, 409, { code: 'CART_INVALID', details: { quote: pricing.publicQuote(q) } });
      }
      if (q.totalPaise !== expected) {
        throw new ApiError('Prices have changed since you reviewed your order. Please review the updated total.', 409, {
          code: 'PRICE_CHANGED',
          details: { quote: pricing.publicQuote(q) },
        });
      }

      const isCod = method === 'COD';
      const now = new Date();
      const doc = new Order({
        _id: orderId,
        orderNumber: generateOrderNumber(now),
        user: user._id,
        orderItems: q.lines.map((l) => ({
          product: l.product,
          name: l.name,
          image: l.image,
          price: toRupees(l.unitPricePaise),
          unitPricePaise: l.unitPricePaise,
          lineTotalPaise: l.lineTotalPaise,
          quantity: l.quantity,
        })),
        shippingAddress,
        paymentMethod: isCod ? 'COD' : 'PhonePe',
        itemsPrice: toRupees(q.itemsPaise),
        shippingPrice: toRupees(q.shippingPaise),
        taxPrice: toRupees(q.taxPaise),
        discountAmount: toRupees(q.discountPaise),
        totalPrice: toRupees(q.totalPaise),
        pricing: {
          itemsPaise: q.itemsPaise,
          discountPaise: q.discountPaise,
          shippingPaise: q.shippingPaise,
          taxPaise: q.taxPaise,
          totalPaise: q.totalPaise,
          taxRateBasisPoints: q.taxRateBasisPoints,
          couponCode: q.couponCode || undefined,
        },
        payment: {
          provider: method,
          status: 'PAYMENT_PENDING',
          amountPaise: q.totalPaise,
          currency: commerce.currency,
          merchantOrderId: isCod ? undefined : `CP_${orderId}`,
        },
        isPaid: false,
        orderStatus: isCod ? 'Pending' : 'AwaitingPayment',
        statusHistory: [history(isCod ? 'Pending' : 'AwaitingPayment', isCod ? 'Order placed (Cash on Delivery).' : 'Order created; awaiting online payment.', user)],
        idempotencyKey,
        requestFingerprint: fp,
        reservationExpiresAt: isCod ? undefined : new Date(now.getTime() + commerce.onlineReservationMinutes * 60000),
        source,
      });

      for (const l of q.lines) {
        await inventory.applyMovement({
          session,
          itemId: l.product,
          type: isCod ? 'SALE' : 'RESERVE',
          quantity: l.quantity,
          order: orderId,
          actor: user,
          reason: isCod ? 'COD order placed' : 'Online checkout reservation',
        });
      }

      if (q.coupon) {
        const c = await Coupon.updateOne(
          {
            _id: q.coupon._id,
            isActive: true,
            ...(q.coupon.usageLimit && { usedCount: { $lt: q.coupon.usageLimit } }),
          },
          { $inc: { usedCount: 1 } },
          { session }
        );
        if (c.modifiedCount !== 1) throw new ApiError('This coupon is no longer available.', 409, { code: 'COUPON_INVALID' });
        await CouponRedemption.create(
          [{ coupon: q.coupon._id, code: q.coupon.code, user: user._id, order: orderId, discountPaise: q.discountPaise }],
          { session }
        );
      }

      if (applyPrimeReward) {
        const { rewardNumber } = await loyalty.redeem({ session, userId: user._id, orderId });
        doc.primeReward = { applied: true, rewardNumber };
      }

      await doc.save({ session });

      if (isCod) {
        await Cart.updateOne({ user: user._id }, { $set: { items: [], couponCode: null, discountAmount: 0 } }, { session });
      }
      await recordTxn({ order: orderId, provider: method, kind: 'INITIATE', outcome: 'ORDER_CREATED', amountPaise: q.totalPaise, merchantOrderId: doc.payment.merchantOrderId }, session);
      return doc;
    });
  } catch (err) {
    // Two identical requests raced: the loser hits the unique index.
    if (err.code === 11000 && String(err.message).includes('idempotencyKey')) {
      const winner = await Order.findOne({ user: user._id, idempotencyKey });
      if (winner) return replay(winner, fp);
    }
    throw err;
  }

  logger.info('order.created', { orderId: String(order._id), provider: method });
  notifications.orderEvent(order, 'placed').catch(() => {});

  if (method === 'PHONEPE') {
    order = await initiateOnlinePayment(order);
  }
  return { order: checkoutView(order), replayed: false };
}

async function replay(existing, fp) {
  if (existing.requestFingerprint && existing.requestFingerprint !== fp) {
    throw new ApiError('This Idempotency-Key was already used for a different checkout request.', 422, { code: 'IDEMPOTENCY_KEY_REUSED' });
  }
  let order = existing;
  // A replay of an online checkout resumes payment initiation if it never succeeded.
  if (order.payment?.provider === 'PHONEPE' && order.orderStatus === 'AwaitingPayment' && !order.payment.redirectUrl) {
    order = await initiateOnlinePayment(order);
  }
  return { order, replayed: true };
}

// ─── online payment ───────────────────────────────────────────────────────

async function initiateOnlinePayment(order) {
  if (order.payment.redirectUrl && order.payment.providerOrderId) return order;
  const provider = getOnlineProvider(order.payment.provider);
  if (!provider) throw new ApiError('Online payment is not available.', 503, { code: 'PAYMENT_PROVIDER_DISABLED' });
  const cfg = phonepeConfig();
  const remaining = Math.max(60, Math.floor((new Date(order.reservationExpiresAt) - Date.now()) / 1000));
  let res;
  try {
    res = await provider.initiate({
      merchantOrderId: order.payment.merchantOrderId,
      amountPaise: order.payment.amountPaise,
      redirectUrl: `${cfg.storefrontUrl}/order-success/${order._id}`,
      expireAfterSeconds: remaining,
      orderRef: order.orderNumber,
    });
  } catch (err) {
    await recordTxn({ order: order._id, provider: order.payment.provider, kind: 'INITIATE', outcome: 'ERROR', merchantOrderId: order.payment.merchantOrderId, note: String(err.message).slice(0, 200) });
    logger.warn('payment.initiate_failed', { orderId: String(order._id) });
    throw new ApiError('We could not start the online payment. Please try again.', 502, {
      code: 'PAYMENT_INIT_FAILED',
      details: { orderId: String(order._id) },
    });
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, orderStatus: 'AwaitingPayment' },
    { $set: { 'payment.providerOrderId': res.providerOrderId, 'payment.redirectUrl': res.redirectUrl } },
    { new: true }
  );
  await recordTxn({ order: order._id, provider: order.payment.provider, kind: 'INITIATE', outcome: res.state, amountPaise: order.payment.amountPaise, merchantOrderId: order.payment.merchantOrderId, providerOrderId: res.providerOrderId, raw: res.raw });
  return updated || order;
}

async function flagForReview(order, reason, extra) {
  await Order.updateOne({ _id: order._id }, { $set: { 'payment.needsReview': true, 'payment.reviewReason': reason } });
  await recordTxn({ order: order._id, provider: order.payment.provider, kind: 'RECONCILE', outcome: 'MISMATCH', note: reason, raw: extra });
  await audit({ action: 'payment.mismatch', entity: 'Order', entityId: order._id, meta: { reason } });
  logger.warn('payment.mismatch', { orderId: String(order._id), reason });
}

/**
 * Apply a provider status that was obtained server-to-server (status API).
 * Idempotent: repeated or out-of-order calls are harmless.
 */
async function applyOnlineStatus(orderId, status, { source = 'status_check' } = {}) {
  let order = await Order.findById(orderId);
  if (!order || !order.payment || order.payment.provider === 'COD') return order;

  if (status.state === 'COMPLETED') {
    if (status.amountPaise !== order.payment.amountPaise) {
      await flagForReview(order, `Amount mismatch: provider ${status.amountPaise} vs order ${order.payment.amountPaise}`, status.raw);
      return Order.findById(orderId);
    }
    if (order.payment.providerOrderId && status.providerOrderId && status.providerOrderId !== order.payment.providerOrderId) {
      await flagForReview(order, 'Provider order id mismatch', status.raw);
      return Order.findById(orderId);
    }
    if (['PAID', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'].includes(order.payment.status)) return order; // already applied

    if (order.orderStatus === 'AwaitingPayment') {
      const done = await withTransaction(async (session) => {
        const o = await Order.findOneAndUpdate(
          { _id: orderId, orderStatus: 'AwaitingPayment', 'payment.status': { $in: ['PAYMENT_PENDING', 'FAILED'] } },
          {
            $set: {
              orderStatus: 'Pending',
              'payment.status': 'PAID',
              'payment.paidAt': new Date(),
              'payment.transactionId': status.transactionId,
              'payment.paymentMode': status.paymentMode,
              isPaid: true,
              paidAt: new Date(),
              reservationExpiresAt: null,
            },
            $push: { statusHistory: history('Pending', `Payment confirmed by provider (${source}).`) },
          },
          { new: true, session }
        );
        if (!o) return null;
        for (const it of o.orderItems) {
          await inventory.applyMovement({ session, itemId: it.product, type: 'COMMIT', quantity: it.quantity, order: o._id, reason: 'Online payment confirmed' });
        }
        await Cart.updateOne({ user: o.user }, { $set: { items: [], couponCode: null, discountAmount: 0 } }, { session });
        await recordTxn({ order: o._id, provider: o.payment.provider, kind: 'STATUS_CHECK', outcome: 'COMPLETED', amountPaise: status.amountPaise, merchantOrderId: o.payment.merchantOrderId, providerOrderId: status.providerOrderId, transactionId: status.transactionId, raw: status.raw }, session);
        return o;
      });
      if (done) {
        logger.info('payment.paid', { orderId: String(orderId) });
        notifications.orderEvent(done, 'paid').catch(() => {});
        return done;
      }
      return Order.findById(orderId);
    }

    if (['Expired', 'Cancelled'].includes(order.orderStatus)) {
      return handleLatePayment(order, status);
    }
    return order;
  }

  if (status.state === 'FAILED') {
    if (order.orderStatus !== 'AwaitingPayment' || order.payment.status !== 'PAYMENT_PENDING') return order;
    const res = await withTransaction(async (session) => {
      const o = await Order.findOneAndUpdate(
        { _id: orderId, orderStatus: 'AwaitingPayment', 'payment.status': 'PAYMENT_PENDING' },
        {
          $set: { orderStatus: 'Cancelled', 'payment.status': 'FAILED', cancelReason: 'Online payment failed', cancelledAt: new Date(), reservationExpiresAt: null },
          $push: { statusHistory: history('Cancelled', `Payment failed (${source}). Reserved stock released.`) },
        },
        { new: true, session }
      );
      if (!o) return null;
      await releaseOrderSideEffects({ session, order: o, reason: 'Online payment failed' });
      await recordTxn({ order: o._id, provider: o.payment.provider, kind: 'STATUS_CHECK', outcome: 'FAILED', merchantOrderId: o.payment.merchantOrderId, raw: status.raw }, session);
      return o;
    });
    return res || Order.findById(orderId);
  }

  return order; // PENDING: nothing to do yet
}

/**
 * Money arrived after the order was expired or cancelled.
 *  - Expired: try to sell the items again; if stock is gone, refund in full.
 *  - Cancelled by the customer/admin: always refund in full.
 */
async function handleLatePayment(order, status) {
  const baseSet = {
    'payment.paidAt': new Date(),
    'payment.transactionId': status.transactionId,
    'payment.paymentMode': status.paymentMode,
    isPaid: true,
    paidAt: new Date(),
  };
  if (order.orderStatus === 'Expired') {
    try {
      const revived = await withTransaction(async (session) => {
        const o = await Order.findOneAndUpdate(
          { _id: order._id, orderStatus: 'Expired', 'payment.status': { $in: ['VOIDED', 'PAYMENT_PENDING', 'FAILED'] } },
          { $set: { ...baseSet, orderStatus: 'Pending', 'payment.status': 'PAID' }, $push: { statusHistory: history('Pending', 'Late payment received after expiry; items re-allocated.') } },
          { new: true, session }
        );
        if (!o) return null;
        for (const it of o.orderItems) {
          await inventory.applyMovement({ session, itemId: it.product, type: 'SALE', quantity: it.quantity, order: o._id, reason: 'Late payment after expiry' });
        }
        await recordTxn({ order: o._id, provider: o.payment.provider, kind: 'STATUS_CHECK', outcome: 'COMPLETED_LATE', amountPaise: status.amountPaise, transactionId: status.transactionId, raw: status.raw }, session);
        return o;
      });
      if (revived) return revived;
      return Order.findById(order._id);
    } catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 409) throw err;
      // fall through to refund: stock no longer available
    }
  }
  const o = await Order.findOneAndUpdate(
    { _id: order._id, orderStatus: { $in: ['Expired', 'Cancelled'] }, 'payment.status': { $in: ['VOIDED', 'PAYMENT_PENDING', 'FAILED'] } },
    {
      $set: {
        ...baseSet,
        orderStatus: 'Cancelled',
        'payment.status': 'REFUND_PENDING',
        'payment.needsReview': true,
        'payment.reviewReason': 'Payment received after the order was closed; automatic full refund started.',
        'payment.refund.status': 'NONE',
        'payment.refund.amountPaise': order.payment.amountPaise,
        'payment.refund.reason': 'Late payment on a closed order',
        'payment.refund.requestedAt': new Date(),
      },
      $push: { statusHistory: history('Cancelled', 'Late payment received; full refund initiated.') },
    },
    { new: true }
  );
  if (!o) return Order.findById(order._id);
  await recordTxn({ order: o._id, provider: o.payment.provider, kind: 'STATUS_CHECK', outcome: 'COMPLETED_LATE_REFUND', amountPaise: status.amountPaise, transactionId: status.transactionId, raw: status.raw });
  await audit({ action: 'payment.late_refund', entity: 'Order', entityId: o._id });
  return startGatewayRefund(o._id);
}

/** Ask the provider for the current status and apply it. */
async function verifyOnlinePayment(orderId, { source = 'status_check' } = {}) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (!order.payment || order.payment.provider === 'COD' || !order.payment.merchantOrderId) return order;
  const provider = getOnlineProvider(order.payment.provider);
  if (!provider) throw new ApiError('Online payment is not available.', 503, { code: 'PAYMENT_PROVIDER_DISABLED' });
  let status;
  try {
    status = await provider.getStatus(order.payment.merchantOrderId);
  } catch (err) {
    logger.warn('payment.status_failed', { orderId: String(orderId) });
    throw new ApiError('Could not confirm the payment status right now. Please refresh in a moment.', 503, { code: 'PAYMENT_STATUS_UNAVAILABLE' });
  }
  return applyOnlineStatus(orderId, status, { source });
}

// ─── release / restock ────────────────────────────────────────────────────

/**
 * Undo an order's stock, coupon and loyalty effects exactly once, based on the
 * ledger rows that exist for this order.
 */
async function releaseOrderSideEffects({ session, order, actor, reason }) {
  const moves = await InventoryMovement.find({ order: order._id }).session(session).select('item type');
  const has = (item, type) => moves.some((m) => String(m.item) === String(item) && m.type === type);
  const legacy = moves.length === 0 && order.legacyOrder === true;
  for (const it of order.orderItems) {
    if (legacy) {
      // Pre-upgrade order: the old checkout sold the stock without a ledger row.
      await inventory.applyMovement({ session, itemId: it.product, type: 'RETURN_TO_STOCK', quantity: it.quantity, order: order._id, actor, reason: `${reason} (legacy order)` });
      continue;
    }
    const reserved = has(it.product, 'RESERVE') && !has(it.product, 'RELEASE') && !has(it.product, 'COMMIT');
    const sold = (has(it.product, 'SALE') || has(it.product, 'COMMIT')) && !has(it.product, 'RETURN_TO_STOCK');
    if (reserved) {
      await inventory.applyMovement({ session, itemId: it.product, type: 'RELEASE', quantity: it.quantity, order: order._id, actor, reason });
    } else if (sold) {
      await inventory.applyMovement({ session, itemId: it.product, type: 'RETURN_TO_STOCK', quantity: it.quantity, order: order._id, actor, reason });
    }
  }
  const red = await CouponRedemption.findOneAndUpdate(
    { order: order._id, status: 'ACTIVE' },
    { $set: { status: 'RELEASED', releasedAt: new Date() } },
    { new: true, session }
  );
  if (red) await Coupon.updateOne({ _id: red.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
  if (order.primeReward?.applied) {
    await loyalty.reverse({ session, userId: order.user, orderId: order._id, note: reason });
  }
}

// ─── cancellation ─────────────────────────────────────────────────────────

async function cancelOrder({ orderId, actor, reason, asAdmin = false, req }) {
  let order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (!asAdmin && String(order.user) !== String(actor._id)) throw new ApiError('Not authorized to cancel this order.', 403);
  if (order.orderStatus === 'Cancelled') throw new ApiError('This order is already cancelled.', 409, { code: 'ALREADY_CANCELLED' });
  if (!sm.CANCELLABLE_STATUSES.includes(order.orderStatus)) {
    throw new ApiError(`An order that is ${order.orderStatus} can no longer be cancelled.`, 400, { code: 'NOT_CANCELLABLE' });
  }

  // Never void an online order without asking the gateway whether money moved.
  if (order.payment?.provider !== 'COD' && order.payment?.status === 'PAYMENT_PENDING' && order.payment.providerOrderId) {
    const provider = getOnlineProvider(order.payment.provider);
    if (!provider) throw new ApiError('Cannot verify the payment status right now; please try again later.', 503);
    let status;
    try {
      status = await provider.getStatus(order.payment.merchantOrderId);
    } catch (err) {
      throw new ApiError('Cannot verify the payment status right now; please try again later.', 503, { code: 'PAYMENT_STATUS_UNAVAILABLE' });
    }
    if (status.state === 'PENDING') {
      throw new ApiError('A payment for this order is still being processed. Please try again in a few minutes.', 409, { code: 'PAYMENT_IN_PROGRESS' });
    }
    if (status.state === 'COMPLETED') {
      order = await applyOnlineStatus(orderId, status, { source: 'pre_cancel_check' });
      if (!sm.CANCELLABLE_STATUSES.includes(order.orderStatus)) {
        throw new ApiError(`An order that is ${order.orderStatus} can no longer be cancelled.`, 400, { code: 'NOT_CANCELLABLE' });
      }
    }
  }

  const note = String(reason || (asAdmin ? 'Cancelled by admin' : 'Cancelled by customer')).trim().slice(0, 300);
  if (!order.payment) return cancelLegacyOrder({ order, actor, note, asAdmin, req });
  const wasPaid = order.payment?.status === 'PAID';
  const fromStatus = order.orderStatus;
  const fromPayment = order.payment?.status;
  const newPaymentStatus = wasPaid ? 'REFUND_PENDING' : fromPayment === 'FAILED' ? 'FAILED' : 'VOIDED';

  const cancelled = await withTransaction(async (session) => {
    const set = {
      orderStatus: 'Cancelled',
      cancelReason: note,
      cancelledAt: new Date(),
      cancelledBy: actor._id,
      reservationExpiresAt: null,
      'payment.status': newPaymentStatus,
    };
    if (wasPaid) {
      Object.assign(set, {
        'payment.refund.status': 'NONE',
        'payment.refund.amountPaise': order.payment.amountPaise,
        'payment.refund.reason': note,
        'payment.refund.requestedBy': actor._id,
        'payment.refund.requestedAt': new Date(),
      });
    }
    const o = await Order.findOneAndUpdate(
      { _id: orderId, orderStatus: fromStatus, 'payment.status': fromPayment },
      { $set: set, $push: { statusHistory: history('Cancelled', note, actor) } },
      { new: true, session }
    );
    if (!o) throw new ApiError('This order was updated by someone else. Please reload.', 409, { code: 'CONCURRENT_UPDATE' });
    await releaseOrderSideEffects({ session, order: o, actor, reason: note });
    await audit({ session, actor, action: asAdmin ? 'order.admin_cancel' : 'order.cancel', entity: 'Order', entityId: o._id, before: { orderStatus: fromStatus, paymentStatus: fromPayment }, after: { orderStatus: 'Cancelled', paymentStatus: newPaymentStatus }, req });
    return o;
  });

  notifications.orderEvent(cancelled, 'cancelled').catch(() => {});
  if (wasPaid && cancelled.payment.provider !== 'COD') return startGatewayRefund(cancelled._id, actor);
  return cancelled;
}

/**
 * Orders created before the payment/ledger upgrade have no `payment` block.
 * Cancelling one restocks it once and never claims a refund happened. If the
 * old code had marked it paid (non-COD, no real payment — DEC-17) it is
 * flagged for manual review instead.
 */
async function cancelLegacyOrder({ order, actor, note, asAdmin, req }) {
  const fromStatus = order.orderStatus;
  const cancelled = await withTransaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: fromStatus, payment: { $exists: false } },
      { $set: { orderStatus: 'Cancelled', cancelReason: note, cancelledAt: new Date(), cancelledBy: actor._id }, $push: { statusHistory: history('Cancelled', note, actor) } },
      { new: true, session }
    );
    if (!o) throw new ApiError('This order was updated by someone else. Please reload.', 409, { code: 'CONCURRENT_UPDATE' });
    o.legacyOrder = true;
    await releaseOrderSideEffects({ session, order: o, actor, reason: note });
    await audit({
      session, actor, action: asAdmin ? 'order.admin_cancel' : 'order.cancel', entity: 'Order', entityId: o._id,
      before: { orderStatus: fromStatus }, after: { orderStatus: 'Cancelled' },
      meta: { legacy: true, legacyIsPaid: !!order.isPaid, paymentMethod: order.paymentMethod }, req,
    });
    return o;
  });
  if (order.isPaid) logger.warn('legacy.cancel_paid_flag', { orderId: String(order._id) });
  return cancelled;
}

/** Give a legacy unpaid COD order a payment block so cash can be recorded. */
async function adoptLegacyCodOrder(order) {
  if (order.payment || order.paymentMethod !== 'COD' || order.isPaid) return order;
  const amountPaise = Math.round((order.totalPrice || 0) * 100);
  const o = await Order.findOneAndUpdate(
    { _id: order._id, payment: { $exists: false } },
    { $set: { payment: { provider: 'COD', status: 'PAYMENT_PENDING', amountPaise, currency: 'INR' } } },
    { new: true }
  );
  return o || Order.findById(order._id);
}

// ─── admin: fulfilment status ─────────────────────────────────────────────

async function adminUpdateStatus({ orderId, actor, orderStatus, trackingNumber, carrier, note, req }) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  const set = {};
  if (trackingNumber !== undefined) set.trackingNumber = clean(String(trackingNumber), 80);
  if (carrier !== undefined) set.carrier = clean(String(carrier), 60);

  if (orderStatus && orderStatus !== order.orderStatus) {
    if (sm.PROTECTED_STATUSES.includes(orderStatus)) {
      throw new ApiError(`"${orderStatus}" cannot be set directly. Use the cancel/refund actions, which also update stock and payments.`, 400, { code: 'PROTECTED_STATUS' });
    }
    if (!sm.canAdminTransition(order.orderStatus, orderStatus)) {
      throw new ApiError(`Cannot change status from ${order.orderStatus} to ${orderStatus}.`, 400, { code: 'INVALID_TRANSITION' });
    }
    set.orderStatus = orderStatus;
    if (orderStatus === 'Delivered') {
      set.isDelivered = true;
      set.deliveredAt = new Date();
    }
  }
  if (!Object.keys(set).length) return order;
  const update = { $set: set };
  if (set.orderStatus) update.$push = { statusHistory: history(set.orderStatus, clean(note || '', 300) || undefined, actor) };
  const o = await Order.findOneAndUpdate({ _id: orderId, orderStatus: order.orderStatus }, update, { new: true });
  if (!o) throw new ApiError('This order was updated by someone else. Please reload.', 409, { code: 'CONCURRENT_UPDATE' });
  await audit({ actor, action: 'order.status', entity: 'Order', entityId: o._id, before: { orderStatus: order.orderStatus }, after: { orderStatus: o.orderStatus, trackingNumber: o.trackingNumber, carrier: o.carrier }, req });
  if (set.orderStatus) notifications.orderEvent(o, 'status').catch(() => {});
  return o;
}

// ─── admin: COD cash collection ───────────────────────────────────────────

async function confirmCodCollection({ orderId, actor, amountPaise, note, req }) {
  let order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (!order.payment) order = await adoptLegacyCodOrder(order);
  if (order.payment?.provider !== 'COD') throw new ApiError('This is not a Cash on Delivery order.', 400);
  if (order.payment.status === 'PAID') throw new ApiError('Cash collection has already been recorded for this order.', 409, { code: 'ALREADY_COLLECTED' });
  if (order.payment.status !== 'PAYMENT_PENDING') throw new ApiError(`Cannot record collection when payment is ${order.payment.status}.`, 400);
  if (!sm.COD_COLLECTABLE_STATUSES.includes(order.orderStatus)) {
    throw new ApiError('Cash can be recorded only when the order is Out for Delivery or Delivered.', 400, { code: 'NOT_COLLECTABLE' });
  }
  if (!Number.isInteger(amountPaise) || amountPaise !== order.payment.amountPaise) {
    throw new ApiError(`Collected amount must equal the order total (${order.payment.amountPaise} paise).`, 400, { code: 'AMOUNT_MISMATCH' });
  }
  return withTransaction(async (session) => {
    const now = new Date();
    const o = await Order.findOneAndUpdate(
      { _id: orderId, 'payment.provider': 'COD', 'payment.status': 'PAYMENT_PENDING' },
      {
        $set: {
          'payment.status': 'PAID',
          'payment.paidAt': now,
          'payment.codCollection': { collectedBy: actor._id, collectedAt: now, amountPaise, note: clean(note || '', 300) || undefined },
          isPaid: true,
          paidAt: now,
        },
        $push: { statusHistory: history(order.orderStatus, 'Cash collected and recorded.', actor) },
      },
      { new: true, session }
    );
    if (!o) throw new ApiError('Cash collection has already been recorded for this order.', 409, { code: 'ALREADY_COLLECTED' });
    await recordTxn({ order: o._id, provider: 'COD', kind: 'COD_COLLECTED', outcome: 'PAID', amountPaise, actor: actor._id, note: clean(note || '', 300) || undefined }, session);
    await audit({ session, actor, action: 'cod.collect', entity: 'Order', entityId: o._id, before: { paymentStatus: 'PAYMENT_PENDING' }, after: { paymentStatus: 'PAID', amountPaise }, req });
    return o;
  });
}

// ─── refunds ──────────────────────────────────────────────────────────────

const REFUNDABLE_ORDER_STATUSES = ['Delivered'];

/** Admin refund of a paid, delivered order (e.g. a return/damage case). */
async function adminRefund({ orderId, actor, reason, restock = false, req }) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (order.payment?.status !== 'PAID') throw new ApiError('Only paid orders can be refunded.', 400, { code: 'NOT_PAID' });
  if (!REFUNDABLE_ORDER_STATUSES.includes(order.orderStatus)) {
    throw new ApiError('Paid orders that are not yet delivered should be cancelled instead (that refunds them).', 400, { code: 'USE_CANCEL' });
  }
  const note = clean(reason || '', 300);
  if (note.length < 3) throw new ApiError('A refund reason is required.', 400);
  const o = await withTransaction(async (session) => {
    const u = await Order.findOneAndUpdate(
      { _id: orderId, 'payment.status': 'PAID' },
      {
        $set: {
          'payment.status': 'REFUND_PENDING',
          'payment.refund.status': 'NONE',
          'payment.refund.amountPaise': order.payment.amountPaise,
          'payment.refund.reason': note,
          'payment.refund.requestedBy': actor._id,
          'payment.refund.requestedAt': new Date(),
        },
        $push: { statusHistory: history(order.orderStatus, `Refund requested: ${note}`, actor) },
      },
      { new: true, session }
    );
    if (!u) throw new ApiError('This order was updated by someone else. Please reload.', 409, { code: 'CONCURRENT_UPDATE' });
    if (restock) {
      for (const it of u.orderItems) {
        await inventory.applyMovement({ session, itemId: it.product, type: 'RETURN_TO_STOCK', quantity: it.quantity, order: u._id, actor, reason: `Refund: ${note}` });
      }
    }
    await audit({ session, actor, action: 'order.refund_request', entity: 'Order', entityId: u._id, after: { paymentStatus: 'REFUND_PENDING', restock: !!restock }, req });
    return u;
  });
  if (o.payment.provider !== 'COD') return startGatewayRefund(o._id, actor);
  return o; // COD: wait for the admin to record the actual refund
}

/**
 * Send a refund to the gateway. Claimed atomically so two callers can never
 * send two refunds; the claim moves refund.status NONE|FAILED → PENDING.
 */
async function startGatewayRefund(orderId, actor) {
  const provider = (() => {
    try { return getOnlineProvider('PHONEPE'); } catch (e) { return null; }
  })();
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.provider': { $ne: 'COD' }, 'payment.status': { $in: ['REFUND_PENDING', 'REFUND_FAILED'] }, 'payment.refund.status': { $in: ['NONE', 'FAILED'] } },
    [
      {
        $set: {
          'payment.status': 'REFUND_PENDING',
          'payment.refund.status': 'PENDING',
          'payment.refund.attempts': { $add: [{ $ifNull: ['$payment.refund.attempts', 0] }, 1] },
        },
      },
      {
        $set: {
          'payment.refund.merchantRefundId': {
            $concat: ['$payment.merchantOrderId', '_R', { $toString: '$payment.refund.attempts' }],
          },
        },
      },
    ],
    { new: true }
  );
  if (!claimed) return Order.findById(orderId);
  const r = claimed.payment.refund;
  if (!provider) {
    return markRefundFailed(claimed._id, 'Payment provider is disabled; refund could not be sent.', actor);
  }
  try {
    const res = await provider.refund({ merchantRefundId: r.merchantRefundId, merchantOrderId: claimed.payment.merchantOrderId, amountPaise: r.amountPaise });
    await recordTxn({ order: claimed._id, provider: claimed.payment.provider, kind: 'REFUND_INITIATE', outcome: res.state, amountPaise: r.amountPaise, merchantRefundId: r.merchantRefundId, actor: actor?._id, raw: res.raw });
    await Order.updateOne({ _id: claimed._id }, { $set: { 'payment.refund.providerRefundId': res.providerRefundId } });
    if (res.state === 'COMPLETED') return finalizeRefund(claimed._id, { source: 'refund_api' });
    if (res.state === 'FAILED') return markRefundFailed(claimed._id, 'Provider rejected the refund.', actor);
    return Order.findById(claimed._id);
  } catch (err) {
    await recordTxn({ order: claimed._id, provider: claimed.payment.provider, kind: 'REFUND_INITIATE', outcome: 'ERROR', merchantRefundId: r.merchantRefundId, note: String(err.message).slice(0, 200) });
    return markRefundFailed(claimed._id, 'Refund request to the provider failed.', actor);
  }
}

async function markRefundFailed(orderId, reason, actor) {
  const o = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.status': 'REFUND_PENDING' },
    { $set: { 'payment.status': 'REFUND_FAILED', 'payment.refund.status': 'FAILED', 'payment.refund.failureReason': reason } },
    { new: true }
  );
  await audit({ actor, action: 'refund.failed', entity: 'Order', entityId: orderId, meta: { reason } });
  logger.warn('refund.failed', { orderId: String(orderId) });
  return o || Order.findById(orderId);
}

async function finalizeRefund(orderId, { source, actor, reference } = {}) {
  const now = new Date();
  const o = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.status': { $in: ['REFUND_PENDING', 'REFUND_FAILED'] } },
    [
      {
        $set: {
          'payment.status': 'REFUNDED',
          'payment.refund.status': 'SUCCEEDED',
          'payment.refund.completedAt': now,
          ...(actor && { 'payment.refund.confirmedBy': actor._id }),
          ...(reference && { 'payment.refund.reference': reference }),
          isPaid: false,
          orderStatus: { $cond: [{ $in: ['$orderStatus', ['Cancelled', 'Delivered']] }, 'Refunded', '$orderStatus'] },
          statusHistory: {
            $concatArrays: ['$statusHistory', [history('Refunded', `Refund completed (${source}).`, actor)]],
          },
        },
      },
    ],
    { new: true }
  );
  if (o) {
    await audit({ actor, action: 'refund.completed', entity: 'Order', entityId: o._id, meta: { source } });
    notifications.orderEvent(o, 'refunded').catch(() => {});
  }
  return o || Order.findById(orderId);
}

/** Check a pending/failed gateway refund with the provider and settle it. */
async function reconcileRefund(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  const r = order.payment?.refund;
  if (!r?.merchantRefundId || order.payment.provider === 'COD') return order;
  if (!['REFUND_PENDING', 'REFUND_FAILED'].includes(order.payment.status)) return order;
  const provider = getOnlineProvider(order.payment.provider);
  if (!provider) throw new ApiError('Online payment is not available.', 503);
  let st;
  try {
    st = await provider.getRefundStatus(r.merchantRefundId);
  } catch (err) {
    if (isNotFound(err)) return { order, notFound: true };
    throw new ApiError('Could not check the refund status right now.', 503, { code: 'REFUND_STATUS_UNAVAILABLE' });
  }
  await recordTxn({ order: order._id, provider: order.payment.provider, kind: 'REFUND_STATUS', outcome: st.state, merchantRefundId: r.merchantRefundId, raw: st.raw });
  if (st.state === 'COMPLETED') return { order: await finalizeRefund(orderId, { source: 'refund_status' }) };
  if (st.state === 'FAILED') return { order: await markRefundFailed(orderId, 'Provider reported the refund failed.'), failed: true };
  return { order, pending: true };
}

function isNotFound(err) {
  const s = Number(err?.httpStatusCode || err?.status);
  return s === 404 || /NOT_FOUND/i.test(String(err?.code || ''));
}

/** Admin retry of a failed gateway refund. Never sends a second refund while one may be in flight. */
async function retryRefund({ orderId, actor, req }) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (order.payment?.provider === 'COD') throw new ApiError('COD refunds are recorded manually.', 400);
  if (order.payment?.status !== 'REFUND_FAILED') throw new ApiError('Only failed refunds can be retried.', 400, { code: 'NOT_RETRYABLE' });
  if (order.payment.refund?.merchantRefundId) {
    const res = await reconcileRefund(orderId);
    if (res.order?.payment?.status === 'REFUNDED') return res.order;
    if (res.pending) throw new ApiError('The previous refund attempt is still processing.', 409, { code: 'REFUND_IN_PROGRESS' });
  }
  await audit({ actor, action: 'refund.retry', entity: 'Order', entityId: order._id, req });
  return startGatewayRefund(orderId, actor);
}

/** COD (or any manual) refund: record the real refund after it was made. */
async function recordManualRefund({ orderId, actor, outcome, reference, note, req }) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError('Order not found.', 404);
  if (order.payment?.provider !== 'COD') throw new ApiError('Online refunds are confirmed by the payment provider.', 400);
  if (!['REFUND_PENDING', 'REFUND_FAILED'].includes(order.payment.status)) throw new ApiError('No refund is pending for this order.', 400);
  const ref = clean(reference || '', 100);
  if (outcome === 'SUCCEEDED') {
    if (ref.length < 3) throw new ApiError('A refund reference (e.g. UPI/bank transaction id) is required.', 400);
    await recordTxn({ order: order._id, provider: 'COD', kind: 'REFUND_MANUAL', outcome: 'SUCCEEDED', amountPaise: order.payment.refund?.amountPaise, actor: actor._id, note: clean(note || '', 300) || undefined });
    await audit({ actor, action: 'refund.manual_confirm', entity: 'Order', entityId: order._id, meta: { reference: ref }, req });
    return finalizeRefund(orderId, { source: 'manual', actor, reference: ref });
  }
  if (outcome === 'FAILED') {
    await recordTxn({ order: order._id, provider: 'COD', kind: 'REFUND_MANUAL', outcome: 'FAILED', actor: actor._id, note: clean(note || '', 300) || undefined });
    return markRefundFailed(orderId, clean(note || 'Manual refund failed', 300), actor);
  }
  throw new ApiError('outcome must be SUCCEEDED or FAILED.', 400);
}

// ─── reservation expiry ───────────────────────────────────────────────────

const PENDING_GRACE_MS = 15 * 60000;

async function expireOne(order, reason) {
  return withTransaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: 'AwaitingPayment', 'payment.status': { $in: ['PAYMENT_PENDING', 'FAILED'] } },
      {
        $set: { orderStatus: 'Expired', 'payment.status': 'VOIDED', reservationExpiresAt: null },
        $push: { statusHistory: history('Expired', reason) },
      },
      { new: true, session }
    );
    if (!o) return null;
    await releaseOrderSideEffects({ session, order: o, reason });
    return o;
  });
}

/** Expire unpaid online orders whose reservation window has passed. */
async function expireReservations(now = new Date()) {
  const due = await Order.find({ orderStatus: 'AwaitingPayment', reservationExpiresAt: { $lte: now } }).limit(50);
  const results = { expired: 0, paid: 0, skipped: 0 };
  for (const order of due) {
    try {
      const provider = order.payment?.providerOrderId ? getOnlineProvider(order.payment.provider) : null;
      const pastGrace = now - new Date(order.reservationExpiresAt) > PENDING_GRACE_MS;
      if (provider) {
        let status = null;
        try {
          status = await provider.getStatus(order.payment.merchantOrderId);
        } catch (err) {
          if (!pastGrace) { results.skipped += 1; continue; }
        }
        if (status?.state === 'COMPLETED') {
          await applyOnlineStatus(order._id, status, { source: 'expiry_check' });
          results.paid += 1;
          continue;
        }
        if (status?.state === 'PENDING' && !pastGrace) { results.skipped += 1; continue; }
      }
      const o = await expireOne(order, 'Payment not completed within the reservation window; stock released.');
      if (o) results.expired += 1;
    } catch (err) {
      logger.error('reservation.expire_failed', { orderId: String(order._id), err: err.message });
    }
  }
  return results;
}

module.exports = {
  quote,
  checkout,
  initiateOnlinePayment,
  applyOnlineStatus,
  verifyOnlinePayment,
  cancelOrder,
  adminUpdateStatus,
  confirmCodCollection,
  adminRefund,
  startGatewayRefund,
  finalizeRefund,
  markRefundFailed,
  reconcileRefund,
  retryRefund,
  recordManualRefund,
  expireReservations,
  validateShippingAddress,
  generateOrderNumber,
  releaseOrderSideEffects,
};
