const crypto = require('crypto');
const Order = require('../models/Order');
const PaymentTransaction = require('../models/PaymentTransaction');
const { enabledMethods } = require('../config/payments');
const { getOnlineProvider } = require('../services/payments');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

// @route GET /api/v1/payments/methods  (public)
exports.getMethods = (req, res) => {
  const methods = enabledMethods().map((m) =>
    m === 'COD'
      ? { id: 'COD', label: 'Cash on Delivery', description: 'Pay in cash when your order is delivered.' }
      : { id: 'PHONEPE', label: 'PhonePe (UPI, cards, net banking)', description: 'Pay securely online with PhonePe.' }
  );
  res.status(200).json({ success: true, data: methods });
};

/**
 * PhonePe callback (webhook).
 * @route POST /api/v1/payments/phonepe/callback  (raw text body)
 *
 * 1. Verify with the SDK's validateCallback (dashboard username/password).
 * 2. Deduplicate: each (type, merchant ids, state) is processed once.
 * 3. Never trust the payload alone: re-check the order/refund status with
 *    the PhonePe status API before changing anything.
 * 4. On a processing error, forget the dedupe record and return 500 so the
 *    provider retries.
 */
exports.phonepeCallback = async (req, res) => {
  const provider = getOnlineProvider('PHONEPE');
  if (!provider) return res.status(404).json({ success: false, message: 'Not found' });

  const rawBody = typeof req.body === 'string' ? req.body : '';
  const cb = provider.verifyCallback({ authorization: req.get('authorization'), rawBody });
  if (!cb) {
    logger.warn('phonepe.callback_rejected');
    return res.status(401).json({ success: false, message: 'Invalid callback' });
  }

  const order = cb.merchantOrderId ? await Order.findOne({ 'payment.merchantOrderId': cb.merchantOrderId }) : null;
  if (!order) {
    logger.warn('phonepe.callback_unknown_order', { type: cb.type });
    return res.status(200).json({ success: true, ignored: true });
  }

  const eventKey = crypto
    .createHash('sha256')
    .update([cb.type, cb.merchantOrderId, cb.merchantRefundId || '', cb.state].join('|'))
    .digest('hex');

  let txn;
  try {
    txn = await PaymentTransaction.create({
      order: order._id,
      provider: 'PHONEPE',
      kind: 'CALLBACK',
      outcome: `${cb.type}:${cb.state}`,
      amountPaise: cb.amountPaise,
      merchantOrderId: cb.merchantOrderId,
      providerOrderId: cb.providerOrderId,
      merchantRefundId: cb.merchantRefundId,
      transactionId: cb.transactionId,
      eventKey,
      raw: cb.raw,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(200).json({ success: true, duplicate: true });
    throw err;
  }

  try {
    if (/REFUND/i.test(cb.type)) {
      await orderService.reconcileRefund(order._id);
    } else {
      await orderService.verifyOnlinePayment(order._id, { source: 'callback' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    await PaymentTransaction.deleteOne({ _id: txn._id });
    logger.error('phonepe.callback_processing_failed', { orderId: String(order._id), err: err.message });
    return res.status(500).json({ success: false, message: 'Processing failed; please retry.' });
  }
};
