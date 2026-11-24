const crypto = require('crypto');

/**
 * In-process stand-in for @phonepe-pg/pg-sdk-node with the same surface the
 * provider uses. No network. Tests drive gateway state with the helpers.
 */
function createFakePhonePeSdk() {
  const state = {
    orders: new Map(), // merchantOrderId → { orderId, state, amount, transactionId }
    refunds: new Map(), // merchantRefundId → { refundId, state, amount }
    calls: { pay: 0, getOrderStatus: 0, refund: 0, getRefundStatus: 0 },
    failPay: false,
    failRefund: false,
    failStatus: false,
  };
  let n = 0;

  const builder = (fields) => () => {
    const v = {};
    const b = {};
    for (const f of fields) b[f] = (x) => { v[f] = x; return b; };
    b.build = () => ({ ...v });
    return b;
  };

  const client = {
    async pay(req) {
      state.calls.pay += 1;
      if (state.failPay) throw Object.assign(new Error('gateway down'), { httpStatusCode: 503 });
      if (state.orders.has(req.merchantOrderId)) throw Object.assign(new Error('duplicate merchantOrderId'), { httpStatusCode: 400 });
      n += 1;
      const o = { orderId: `OMO${n}`, state: 'PENDING', amount: req.amount, merchantOrderId: req.merchantOrderId };
      state.orders.set(req.merchantOrderId, o);
      return { orderId: o.orderId, state: 'PENDING', expireAt: Date.now() + 1800000, redirectUrl: `https://mercury-uat.phonepe.com/fake/${o.orderId}` };
    },
    async getOrderStatus(merchantOrderId) {
      state.calls.getOrderStatus += 1;
      if (state.failStatus) throw Object.assign(new Error('status unavailable'), { httpStatusCode: 503 });
      const o = state.orders.get(merchantOrderId);
      if (!o) throw Object.assign(new Error('not found'), { httpStatusCode: 404 });
      return {
        orderId: o.orderId,
        state: o.state,
        amount: o.amount,
        paymentDetails: o.transactionId ? [{ transactionId: o.transactionId, paymentMode: 'UPI_INTENT', state: o.state, amount: o.amount, timestamp: Date.now() }] : [],
      };
    },
    async refund(req) {
      state.calls.refund += 1;
      if (state.failRefund) throw Object.assign(new Error('refund failed to start'), { httpStatusCode: 500 });
      n += 1;
      const r = { refundId: `RF${n}`, state: 'PENDING', amount: req.amount, merchantRefundId: req.merchantRefundId, originalMerchantOrderId: req.originalMerchantOrderId };
      state.refunds.set(req.merchantRefundId, r);
      return { refundId: r.refundId, amount: r.amount, state: 'PENDING' };
    },
    async getRefundStatus(merchantRefundId) {
      state.calls.getRefundStatus += 1;
      const r = state.refunds.get(merchantRefundId);
      if (!r) throw Object.assign(new Error('not found'), { httpStatusCode: 404 });
      return { merchantRefundId, state: r.state, amount: r.amount };
    },
    validateCallback(username, password, authorization, body) {
      const expected = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
      if (authorization !== expected) throw new Error('Invalid callback');
      return JSON.parse(body);
    },
  };

  const sdk = {
    Env: { SANDBOX: 'SANDBOX', PRODUCTION: 'PRODUCTION' },
    StandardCheckoutClient: { getInstance: () => client },
    StandardCheckoutPayRequest: { builder: builder(['merchantOrderId', 'amount', 'redirectUrl', 'expireAfter', 'metaInfo']) },
    RefundRequest: { builder: builder(['merchantRefundId', 'originalMerchantOrderId', 'amount']) },
    MetaInfo: { builder: builder(['udf1', 'udf2']) },
  };

  const helpers = {
    complete(merchantOrderId, { amount } = {}) {
      const o = state.orders.get(merchantOrderId);
      o.state = 'COMPLETED';
      o.transactionId = `T${merchantOrderId.slice(-6)}`;
      if (amount !== undefined) o.amount = amount;
    },
    fail(merchantOrderId) {
      state.orders.get(merchantOrderId).state = 'FAILED';
    },
    settleRefund(merchantRefundId, s = 'COMPLETED') {
      state.refunds.get(merchantRefundId).state = s;
    },
    authHeader(username, password) {
      return crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
    },
  };

  return { sdk, state, ...helpers };
}

module.exports = { createFakePhonePeSdk };
