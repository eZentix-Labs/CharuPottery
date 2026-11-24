const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const InventoryMovement = require('../models/InventoryMovement');
const AuditLog = require('../models/AuditLog');
const { createUser, createProduct, address, newKey, addToCart, quote, checkoutCod, ledgerBalance } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

async function deliveredCodOrder() {
  const { user, auth } = await createUser();
  const admin = await createUser('admin');
  const p = await createProduct({ stock: 5, price: 1000 });
  await addToCart(app, auth, p._id, 2);
  const res = await checkoutCod(app, auth);
  const id = res.body.data._id;
  for (const s of ['Processing', 'Shipped', 'Delivered']) {
    const r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: s });
    expect(r.status).toBe(200);
  }
  return { id, user, auth, admin, product: p, total: res.body.data.payment.amountPaise };
}

describe('COD checkout', () => {
  test('creates an order with PAYMENT_PENDING, sells stock with a ledger row and clears the cart', async () => {
    const { auth, user } = await createUser();
    const p = await createProduct({ stock: 5, price: 1000 });
    await addToCart(app, auth, p._id, 2);

    const res = await checkoutCod(app, auth);
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o.orderStatus).toBe('Pending');
    expect(o.payment.provider).toBe('COD');
    expect(o.payment.status).toBe('PAYMENT_PENDING');
    expect(o.isPaid).toBe(false);
    // 2 × ₹1000 = 200000 paise, 5% tax = 10000, shipping 9900 (≤ ₹2000)
    expect(o.pricing).toMatchObject({ itemsPaise: 200000, taxPaise: 10000, shippingPaise: 9900, totalPaise: 219900 });
    expect(o.totalPrice).toBe(2199);

    const prod = await Product.findById(p._id);
    expect(prod.stock).toBe(3);
    expect(prod.soldCount).toBe(2);
    expect(prod.reservedStock).toBe(0);
    const moves = await InventoryMovement.find({ order: o._id });
    expect(moves.map((m) => m.type)).toEqual(['SALE']);
    expect(await ledgerBalance(p._id)).toBe(3);
    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(0);
  });

  test('ignores client-supplied isPaid / paymentResult / prices', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5, price: 1000 });
    await addToCart(app, auth, p._id, 1);
    const q = await quote(app, auth);
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set(auth)
      .set('Idempotency-Key', newKey())
      .send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise, isPaid: true, paymentResult: { status: 'succeeded' }, totalPrice: 1, orderItems: [{ price: 1 }] });
    expect(res.status).toBe(201);
    const o = await Order.findById(res.body.data._id);
    expect(o.isPaid).toBe(false);
    expect(o.payment.status).toBe('PAYMENT_PENDING');
    expect(o.pricing.totalPaise).toBe(q.totalPaise);
    expect(o.paymentResult?.status).toBeUndefined();
  });

  test('legacy and unsupported payment methods are rejected (no fake UPI/Stripe paid orders)', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const q = await quote(app, auth);
    for (const method of ['UPI', 'Stripe', 'Card', 'PHONEPE']) {
      const res = await request(app).post('/api/v1/orders').set(auth).set('Idempotency-Key', newKey())
        .send({ shippingAddress: address, paymentMethod: method, expectedTotalPaise: q.totalPaise });
      expect(res.status).toBe(400);
    }
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(p._id)).stock).toBe(5);
  });

  test('requires an Idempotency-Key, a valid address and the confirmed total', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const q = await quote(app, auth);
    let res = await request(app).post('/api/v1/orders/checkout').set(auth).send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    res = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', newKey()).send({ shippingAddress: { ...address, postalCode: '12' }, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise });
    expect(res.status).toBe(400);
    expect(res.body.details.postalCode).toBeDefined();
    res = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', newKey()).send({ shippingAddress: address, paymentMethod: 'COD' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXPECTED_TOTAL_REQUIRED');
  });

  test('empty cart → 400', async () => {
    const { auth } = await createUser();
    const res = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', newKey())
      .send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: 0 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CART_EMPTY');
  });
});

describe('idempotency', () => {
  test('same key sent twice sequentially returns the same single order', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const key = newKey();
    const q = await quote(app, auth);
    const body = { shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise };
    const a = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', key).send(body);
    const b = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', key).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.replayed).toBe(true);
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(p._id)).stock).toBe(4);
  });

  test('same key sent concurrently (double click) creates exactly one order', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const key = newKey();
    const q = await quote(app, auth);
    const body = { shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', key).send(body))
    );
    const ids = new Set(results.filter((r) => r.status < 300).map((r) => r.body.data._id));
    expect(ids.size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(p._id)).stock).toBe(4);
    expect(await ledgerBalance(p._id)).toBe(4);
  });

  test('reusing a key for a different request → 422', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const key = newKey();
    const first = await checkoutCod(app, auth, { key });
    expect(first.status).toBe(201);
    const res = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', key)
      .send({ shippingAddress: { ...address, city: 'Mumbai' }, paymentMethod: 'COD', expectedTotalPaise: 1 });
    expect(res.status).toBe(422);
  });
});

describe('fulfilment status transitions', () => {
  test('admin follows the allowed path; invalid jumps and protected statuses are refused', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const id = (await checkoutCod(app, auth)).body.data._id;

    let r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'Delivered' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('INVALID_TRANSITION');
    for (const s of ['Cancelled', 'Refunded', 'Expired', 'AwaitingPayment']) {
      r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: s });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('PROTECTED_STATUS');
    }
    r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'PAID' });
    expect(r.status).toBe(400);

    r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'Processing', note: 'packing' });
    expect(r.status).toBe(200);
    r = await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'Pending' });
    expect(r.status).toBe(400); // no going backwards
    expect(await AuditLog.countDocuments({ action: 'order.status', entityId: id })).toBe(1);
  });

  test('a delivered COD order is NOT marked paid', async () => {
    const { id } = await deliveredCodOrder();
    const o = await Order.findById(id);
    expect(o.orderStatus).toBe('Delivered');
    expect(o.payment.status).toBe('PAYMENT_PENDING');
    expect(o.isPaid).toBe(false);
  });

  test('customers cannot use admin order actions', async () => {
    const { id, auth } = await deliveredCodOrder();
    for (const [method, path] of [['put', 'status'], ['post', 'cod/collect'], ['post', 'admin-cancel'], ['post', 'refund'], ['get', 'history']]) {
      const r = await request(app)[method](`/api/v1/orders/${id}/${path}`).set(auth).send({ orderStatus: 'Delivered', amountPaise: 1 });
      expect(r.status).toBe(403);
    }
    expect((await request(app).get('/api/v1/orders').set(auth)).status).toBe(403);
  });
});

describe('COD cash collection', () => {
  test('records who/when/amount, sets PAID once; duplicates refused', async () => {
    const { id, admin, total } = await deliveredCodOrder();
    let r = await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total - 100 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('AMOUNT_MISMATCH');

    r = await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total, note: 'collected by courier' });
    expect(r.status).toBe(200);
    const o = await Order.findById(id);
    expect(o.payment.status).toBe('PAID');
    expect(o.isPaid).toBe(true);
    expect(String(o.payment.codCollection.collectedBy)).toBe(String(admin.user._id));
    expect(o.payment.codCollection.amountPaise).toBe(total);
    expect(o.payment.codCollection.collectedAt).toBeInstanceOf(Date);

    r = await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total });
    expect(r.status).toBe(409);
    expect(await AuditLog.countDocuments({ action: 'cod.collect' })).toBe(1);
  });

  test('concurrent duplicate collection requests record exactly one collection', async () => {
    const { id, admin, total } = await deliveredCodOrder();
    const rs = await Promise.all(Array.from({ length: 4 }, () => request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'cod.collect' })).toBe(1);
  });

  test('cannot record collection before the order is out for delivery', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const res = await checkoutCod(app, auth);
    const r = await request(app).post(`/api/v1/orders/${res.body.data._id}/cod/collect`).set(admin.auth).send({ amountPaise: res.body.data.payment.amountPaise });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NOT_COLLECTABLE');
  });
});

describe('cancellation', () => {
  test('customer cancels an unpaid COD order: stock returned once, payment VOIDED, no refund', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 2);
    const id = (await checkoutCod(app, auth)).body.data._id;
    const r = await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth).send({ reason: 'changed my mind' });
    expect(r.status).toBe(200);
    expect(r.body.data.orderStatus).toBe('Cancelled');
    expect(r.body.data.payment.status).toBe('VOIDED');
    expect((await Product.findById(p._id)).stock).toBe(5);
    const again = await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth);
    expect(again.status).toBe(409);
    expect((await Product.findById(p._id)).stock).toBe(5);
    expect(await ledgerBalance(p._id)).toBe(5);
  });

  test('another customer cannot cancel or view my order', async () => {
    const { auth } = await createUser();
    const other = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const id = (await checkoutCod(app, auth)).body.data._id;
    expect((await request(app).post(`/api/v1/orders/${id}/cancel`).set(other.auth)).status).toBe(403);
    expect((await request(app).get(`/api/v1/orders/${id}`).set(other.auth)).status).toBe(403);
  });

  test('shipped orders cannot be cancelled', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 5 });
    await addToCart(app, auth, p._id, 1);
    const id = (await checkoutCod(app, auth)).body.data._id;
    await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'Processing' });
    await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: 'Shipped' });
    const r = await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NOT_CANCELLABLE');
  });
});

describe('COD refund after collection (manual)', () => {
  test('refund is pending until an admin records the actual refund with a reference', async () => {
    const { id, admin, total, product } = await deliveredCodOrder();
    await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total });
    let r = await request(app).post(`/api/v1/orders/${id}/refund`).set(admin.auth).send({ reason: 'Damaged in transit', restock: true });
    expect(r.status).toBe(200);
    expect(r.body.data.payment.status).toBe('REFUND_PENDING');
    expect((await Product.findById(product._id)).stock).toBe(5);

    r = await request(app).post(`/api/v1/orders/${id}/refund/manual`).set(admin.auth).send({ outcome: 'SUCCEEDED' });
    expect(r.status).toBe(400); // reference required

    r = await request(app).post(`/api/v1/orders/${id}/refund/manual`).set(admin.auth).send({ outcome: 'SUCCEEDED', reference: 'UPI-REF-778899' });
    expect(r.status).toBe(200);
    const o = await Order.findById(id);
    expect(o.payment.status).toBe('REFUNDED');
    expect(o.orderStatus).toBe('Refunded');
    expect(o.payment.refund.reference).toBe('UPI-REF-778899');
    expect(o.isPaid).toBe(false);

    r = await request(app).post(`/api/v1/orders/${id}/refund`).set(admin.auth).send({ reason: 'again' });
    expect(r.status).toBe(400);
    expect((await Product.findById(product._id)).stock).toBe(5); // restocked exactly once
  });
});

describe('analytics', () => {
  test('unpaid COD is not counted as revenue; collected COD is', async () => {
    const { id, admin, total } = await deliveredCodOrder();
    let r = await request(app).get('/api/v1/orders/analytics/summary').set(admin.auth);
    expect(r.body.data.netRevenuePaise).toBe(0);
    expect(r.body.data.awaitingPaymentPaise).toBe(total);
    await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: total });
    r = await request(app).get('/api/v1/orders/analytics/summary').set(admin.auth);
    expect(r.body.data.netRevenuePaise).toBe(total);
    const d = await request(app).get('/api/v1/admin/dashboard').set(admin.auth);
    expect(d.status).toBe(200);
    expect(d.body.data.revenueLast30DaysPaise).toBe(total);
  });
});
