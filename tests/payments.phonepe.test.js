const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const InventoryMovement = require('../models/InventoryMovement');
const PaymentTransaction = require('../models/PaymentTransaction');
const { phonepeConfig, enabledMethods } = require('../config/payments');
const { __setPhonePeSdkForTests } = require('../services/payments');
const orderService = require('../services/orderService');
const { createFakePhonePeSdk } = require('./helpers/fakePhonePeSdk');
const { createUser, createProduct, address, newKey, addToCart, quote, ledgerBalance } = require('./helpers/fixtures');

const app = createApp();

const ENV = {
  PHONEPE_ENABLED: 'true',
  PHONEPE_ENV: 'sandbox',
  PHONEPE_CLIENT_ID: 'TEST_CLIENT_ID',
  PHONEPE_CLIENT_SECRET: 'test-secret',
  PHONEPE_CLIENT_VERSION: '1',
  PHONEPE_CALLBACK_USERNAME: 'cb_user',
  PHONEPE_CALLBACK_PASSWORD: 'cb_pass',
  PUBLIC_STOREFRONT_URL: 'http://localhost:3000',
};

let fake;
function enablePhonePe() {
  Object.assign(process.env, ENV);
  fake = createFakePhonePeSdk();
  __setPhonePeSdkForTests(fake.sdk);
}
function disablePhonePe() {
  for (const k of Object.keys(ENV)) delete process.env[k];
  __setPhonePeSdkForTests(null);
}

beforeAll(db.connectReplSet);
afterAll(async () => {
  disablePhonePe();
  await db.disconnect();
});
beforeEach(async () => {
  await db.clearDb();
  disablePhonePe();
});

async function phonepeCheckout(auth, { key = newKey() } = {}) {
  const q = await quote(app, auth);
  return request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', key)
    .send({ shippingAddress: address, paymentMethod: 'PHONEPE', expectedTotalPaise: q.totalPaise });
}

async function setupOrder({ stock = 3, qty = 1 } = {}) {
  enablePhonePe();
  const u = await createUser();
  const p = await createProduct({ stock, price: 1500 });
  await addToCart(app, u.auth, p._id, qty);
  const res = await phonepeCheckout(u.auth);
  expect(res.status).toBe(201);
  const order = await Order.findById(res.body.data._id);
  return { ...u, p, res, order, moid: order.payment.merchantOrderId };
}

function callback(body, auth = fake.authHeader('cb_user', 'cb_pass')) {
  return request(app).post('/api/v1/payments/phonepe/callback').set('Authorization', auth).set('Content-Type', 'application/json').send(JSON.stringify(body));
}

describe('PhonePe disabled (default, no credentials)', () => {
  test('only COD is offered; PhonePe checkout and callback are refused; nothing is called', async () => {
    expect(phonepeConfig().enabled).toBe(false);
    expect(enabledMethods()).toEqual(['COD']);
    const m = await request(app).get('/api/v1/payments/methods');
    expect(m.body.data.map((x) => x.id)).toEqual(['COD']);

    const { auth } = await createUser();
    const p = await createProduct({ stock: 2 });
    await addToCart(app, auth, p._id, 1);
    const r = await phonepeCheckout(auth);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PAYMENT_METHOD_DISABLED');
    expect((await request(app).post('/api/v1/payments/phonepe/callback').send('{}')).status).toBe(404);
  });

  test('partial credentials keep it disabled; production refuses sandbox and needs explicit approval', () => {
    process.env.PHONEPE_ENABLED = 'true';
    process.env.PHONEPE_CLIENT_ID = 'x';
    expect(phonepeConfig().enabled).toBe(false);
    expect(phonepeConfig().disabledReason).toMatch(/missing configuration/);
    Object.assign(process.env, ENV);
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(phonepeConfig().disabledReason).toMatch(/sandbox credentials cannot be used in production/);
      process.env.PHONEPE_ENV = 'production';
      expect(phonepeConfig().disabledReason).toMatch(/PHONEPE_PRODUCTION_APPROVED/);
      process.env.PHONEPE_PRODUCTION_APPROVED = 'true';
      expect(phonepeConfig().enabled).toBe(true);
    } finally {
      process.env.NODE_ENV = prevEnv;
      delete process.env.PHONEPE_PRODUCTION_APPROVED;
    }
  });
});

describe('PhonePe checkout (mocked sandbox)', () => {
  test('creates AwaitingPayment order, reserves stock (not sold), returns the gateway redirect; cart kept', async () => {
    const { res, p, user, order } = await setupOrder({ stock: 3, qty: 2 });
    expect(res.body.payment.redirectUrl).toMatch(/^https:\/\/mercury-uat\.phonepe\.com\//);
    expect(order.orderStatus).toBe('AwaitingPayment');
    expect(order.payment.status).toBe('PAYMENT_PENDING');
    expect(order.payment.merchantOrderId).toMatch(/^CP_[a-f0-9]{24}$/);
    expect(order.payment.merchantOrderId.length).toBeLessThanOrEqual(63);
    expect(order.reservationExpiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60000);
    const prod = await Product.findById(p._id);
    expect(prod.stock).toBe(1);
    expect(prod.reservedStock).toBe(2);
    expect(prod.soldCount).toBe(0);
    expect((await Cart.findOne({ user: user._id })).items).toHaveLength(1);
    expect(fake.state.calls.pay).toBe(1);
  });

  test('idempotent replay does not call the gateway twice', async () => {
    enablePhonePe();
    const { auth } = await createUser();
    const p = await createProduct({ stock: 3 });
    await addToCart(app, auth, p._id, 1);
    const key = newKey();
    const a = await phonepeCheckout(auth, { key });
    const b = await phonepeCheckout(auth, { key });
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(fake.state.calls.pay).toBe(1);
  });

  test('gateway down at initiation → 502; same Idempotency-Key retry resumes initiation', async () => {
    enablePhonePe();
    const { auth } = await createUser();
    const p = await createProduct({ stock: 3 });
    await addToCart(app, auth, p._id, 1);
    fake.state.failPay = true;
    const key = newKey();
    const a = await phonepeCheckout(auth, { key });
    expect(a.status).toBe(502);
    expect(a.body.code).toBe('PAYMENT_INIT_FAILED');
    fake.state.failPay = false;
    const b = await phonepeCheckout(auth, { key });
    expect(b.status).toBe(200);
    expect(b.body.payment.redirectUrl).toBeTruthy();
    expect(await Order.countDocuments()).toBe(1);
  });

  test('pending status keeps the order unpaid', async () => {
    const { auth, order } = await setupOrder();
    const r = await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(auth);
    expect(r.status).toBe(200);
    expect(r.body.data.payment.status).toBe('PAYMENT_PENDING');
    expect(r.body.data.isPaid).toBe(false);
  });

  test('server-verified COMPLETED → PAID, reservation committed to a sale, cart cleared', async () => {
    const { auth, order, moid, p, user } = await setupOrder({ stock: 3, qty: 2 });
    fake.complete(moid);
    const r = await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(auth);
    expect(r.body.data.payment.status).toBe('PAID');
    expect(r.body.data.orderStatus).toBe('Pending');
    expect(r.body.data.isPaid).toBe(true);
    const prod = await Product.findById(p._id);
    expect(prod).toMatchObject({ stock: 1, reservedStock: 0, soldCount: 2 });
    expect((await InventoryMovement.find({ order: order._id })).map((m) => m.type).sort()).toEqual(['COMMIT', 'RESERVE']);
    expect((await Cart.findOne({ user: user._id })).items).toHaveLength(0);
    expect(await ledgerBalance(p._id)).toBe(1);
    // repeated verification is harmless
    await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(auth);
    expect(await InventoryMovement.countDocuments({ order: order._id, type: 'COMMIT' })).toBe(1);
  });

  test('incorrect amount reported by the gateway → NOT paid, flagged for review', async () => {
    const { auth, order, moid } = await setupOrder();
    fake.complete(moid, { amount: 100 });
    const r = await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(auth);
    expect(r.body.data.payment.status).toBe('PAYMENT_PENDING');
    const o = await Order.findById(order._id);
    expect(o.payment.needsReview).toBe(true);
    expect(o.isPaid).toBe(false);
    expect(await PaymentTransaction.countDocuments({ order: order._id, outcome: 'MISMATCH' })).toBe(1);
  });

  test('FAILED payment → order cancelled, payment FAILED, reserved stock released', async () => {
    const { auth, order, moid, p } = await setupOrder({ stock: 3, qty: 2 });
    fake.fail(moid);
    const r = await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(auth);
    expect(r.body.data.orderStatus).toBe('Cancelled');
    expect(r.body.data.payment.status).toBe('FAILED');
    expect(await Product.findById(p._id)).toMatchObject({ stock: 3, reservedStock: 0 });
  });

  test('another customer cannot verify my payment', async () => {
    const { order } = await setupOrder();
    const other = await createUser();
    expect((await request(app).post(`/api/v1/orders/${order._id}/payment/verify`).set(other.auth)).status).toBe(404);
  });
});

describe('PhonePe callbacks', () => {
  test('invalid authorization → 401 and no change', async () => {
    const { order, moid } = await setupOrder();
    fake.complete(moid);
    const r = await callback({ type: 'CHECKOUT_ORDER_COMPLETED', payload: { originalMerchantOrderId: moid, state: 'COMPLETED', amount: order.payment.amountPaise } }, 'wrong');
    expect(r.status).toBe(401);
    expect((await Order.findById(order._id)).payment.status).toBe('PAYMENT_PENDING');
  });

  test('a forged COMPLETED callback is not trusted: status API still says PENDING → unpaid', async () => {
    const { order, moid } = await setupOrder();
    const r = await callback({ type: 'CHECKOUT_ORDER_COMPLETED', payload: { originalMerchantOrderId: moid, state: 'COMPLETED', amount: order.payment.amountPaise } });
    expect(r.status).toBe(200);
    expect((await Order.findById(order._id)).payment.status).toBe('PAYMENT_PENDING');
  });

  test('valid callback marks paid; the duplicate is processed once', async () => {
    const { order, moid } = await setupOrder();
    fake.complete(moid);
    const body = { type: 'CHECKOUT_ORDER_COMPLETED', payload: { originalMerchantOrderId: moid, orderId: 'OMO1', state: 'COMPLETED', amount: order.payment.amountPaise } };
    const a = await callback(body);
    const b = await callback(body);
    expect(a.status).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect((await Order.findById(order._id)).payment.status).toBe('PAID');
    expect(await PaymentTransaction.countDocuments({ order: order._id, kind: 'CALLBACK' })).toBe(1);
    expect(await InventoryMovement.countDocuments({ order: order._id, type: 'COMMIT' })).toBe(1);
  });

  test('incorrect merchant order id in callback is ignored', async () => {
    const { order, moid } = await setupOrder();
    fake.complete(moid);
    const r = await callback({ type: 'CHECKOUT_ORDER_COMPLETED', payload: { originalMerchantOrderId: 'CP_000000000000000000000000', state: 'COMPLETED', amount: 1 } });
    expect(r.body.ignored).toBe(true);
    expect((await Order.findById(order._id)).payment.status).toBe('PAYMENT_PENDING');
  });

  test('processing failure → 500 so the provider retries; the retry succeeds', async () => {
    const { order, moid } = await setupOrder();
    fake.complete(moid);
    fake.state.failStatus = true;
    const body = { type: 'CHECKOUT_ORDER_COMPLETED', payload: { originalMerchantOrderId: moid, state: 'COMPLETED', amount: order.payment.amountPaise } };
    expect((await callback(body)).status).toBe(500);
    fake.state.failStatus = false;
    expect((await callback(body)).status).toBe(200);
    expect((await Order.findById(order._id)).payment.status).toBe('PAID');
  });
});

describe('reservation expiry', () => {
  test('expired unpaid reservation → Expired, stock released; COD orders untouched', async () => {
    const { order, p } = await setupOrder({ stock: 3, qty: 2 });
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 20 * 60000) } });
    fake.fail(order.payment.merchantOrderId);
    const r = await orderService.expireReservations();
    expect(r.expired + r.paid).toBeGreaterThanOrEqual(0);
    const o = await Order.findById(order._id);
    expect(['Expired', 'Cancelled']).toContain(o.orderStatus);
    expect(await Product.findById(p._id)).toMatchObject({ stock: 3, reservedStock: 0 });
    expect(await ledgerBalance(p._id)).toBe(3);
  });

  test('gateway still PENDING past the window + grace → Expired and released', async () => {
    const { order, p } = await setupOrder({ stock: 3, qty: 1 });
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 20 * 60000) } });
    const r = await orderService.expireReservations();
    expect(r.expired).toBe(1);
    expect((await Order.findById(order._id)).orderStatus).toBe('Expired');
    expect((await Product.findById(p._id)).stock).toBe(3);
  });

  test('race: gateway says COMPLETED at expiry time → paid, not expired', async () => {
    const { order, moid } = await setupOrder();
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 60000) } });
    fake.complete(moid);
    const r = await orderService.expireReservations();
    expect(r.paid).toBe(1);
    expect((await Order.findById(order._id)).payment.status).toBe('PAID');
  });

  test('late payment after expiry with stock available → re-allocated and paid', async () => {
    const { order, moid, p } = await setupOrder({ stock: 3, qty: 1 });
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 20 * 60000) } });
    await orderService.expireReservations();
    fake.complete(moid);
    const o = await orderService.verifyOnlinePayment(order._id);
    expect(o.orderStatus).toBe('Pending');
    expect(o.payment.status).toBe('PAID');
    expect((await Product.findById(p._id)).stock).toBe(2);
  });

  test('late payment after expiry when sold out → automatic full refund started', async () => {
    const { order, moid, p } = await setupOrder({ stock: 1, qty: 1 });
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 20 * 60000) } });
    await orderService.expireReservations();
    await Product.updateOne({ _id: p._id }, { $set: { stock: 0 } }); // sold elsewhere
    fake.complete(moid);
    const o = await orderService.verifyOnlinePayment(order._id);
    expect(o.orderStatus).toBe('Cancelled');
    expect(o.payment.status).toBe('REFUND_PENDING');
    expect(o.payment.needsReview).toBe(true);
    expect(fake.state.calls.refund).toBe(1);
  });
});

describe('PhonePe refunds', () => {
  async function paidOrder() {
    const ctx = await setupOrder({ stock: 3, qty: 1 });
    fake.complete(ctx.moid);
    await request(app).post(`/api/v1/orders/${ctx.order._id}/payment/verify`).set(ctx.auth);
    return ctx;
  }

  test('cancel paid order → refund pending (not refunded) until the provider confirms', async () => {
    const { auth, order, p } = await paidOrder();
    const r = await request(app).post(`/api/v1/orders/${order._id}/cancel`).set(auth);
    expect(r.status).toBe(200);
    let o = await Order.findById(order._id);
    expect(o.orderStatus).toBe('Cancelled');
    expect(o.payment.status).toBe('REFUND_PENDING');
    expect(o.payment.refund.status).toBe('PENDING');
    expect(o.payment.refund.merchantRefundId).toBe(`${o.payment.merchantOrderId}_R1`);
    expect((await Product.findById(p._id)).stock).toBe(3);

    fake.settleRefund(o.payment.refund.merchantRefundId, 'COMPLETED');
    const cb = await callback({ type: 'PG_REFUND_COMPLETED', payload: { originalMerchantOrderId: o.payment.merchantOrderId, merchantRefundId: o.payment.refund.merchantRefundId, state: 'COMPLETED', amount: o.payment.amountPaise } });
    expect(cb.status).toBe(200);
    o = await Order.findById(order._id);
    expect(o.payment.status).toBe('REFUNDED');
    expect(o.orderStatus).toBe('Refunded');
    expect(fake.state.calls.refund).toBe(1);
  });

  test('refund failure → REFUND_FAILED; admin retry sends one new refund after checking the previous one', async () => {
    const { auth, order } = await paidOrder();
    const admin = await createUser('admin');
    fake.state.failRefund = true;
    await request(app).post(`/api/v1/orders/${order._id}/cancel`).set(auth);
    let o = await Order.findById(order._id);
    expect(o.payment.status).toBe('REFUND_FAILED');
    fake.state.failRefund = false;
    const r = await request(app).post(`/api/v1/orders/${order._id}/refund/retry`).set(admin.auth);
    expect(r.status).toBe(200);
    o = await Order.findById(order._id);
    expect(o.payment.status).toBe('REFUND_PENDING');
    expect(o.payment.refund.merchantRefundId).toBe(`${o.payment.merchantOrderId}_R2`);
    // a second retry while pending is refused
    const again = await request(app).post(`/api/v1/orders/${order._id}/refund/retry`).set(admin.auth);
    expect(again.status).toBe(400);
    // reconciliation settles it
    fake.settleRefund(o.payment.refund.merchantRefundId, 'COMPLETED');
    const rec = await request(app).post(`/api/v1/orders/${order._id}/refund/reconcile`).set(admin.auth);
    expect(rec.body.data.payment.status).toBe('REFUNDED');
  });

  test('provider reports refund FAILED → REFUND_FAILED (never marked refunded)', async () => {
    const { auth, order } = await paidOrder();
    await request(app).post(`/api/v1/orders/${order._id}/cancel`).set(auth);
    const o = await Order.findById(order._id);
    fake.settleRefund(o.payment.refund.merchantRefundId, 'FAILED');
    await orderService.reconcileRefund(order._id);
    expect((await Order.findById(order._id)).payment.status).toBe('REFUND_FAILED');
  });

  test('cancelling an unpaid PhonePe order checks the gateway first: PENDING → 409, nothing voided', async () => {
    const { auth, order } = await setupOrder();
    const r = await request(app).post(`/api/v1/orders/${order._id}/cancel`).set(auth);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect((await Order.findById(order._id)).orderStatus).toBe('AwaitingPayment');
  });
});
