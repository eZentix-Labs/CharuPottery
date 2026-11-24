const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const Order = require('../models/Order');
const { createUser, createProduct, address, newKey, addToCart, quote, checkoutCod } = require('./helpers/fixtures');
const { applyBps } = require('../utils/money');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

describe('server-side pricing', () => {
  test('paise rounding is exact (₹333.33 × 3 with 5% tax)', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 10, price: 333.33 });
    await addToCart(app, auth, p._id, 3);
    const q = await quote(app, auth);
    expect(q.itemsPaise).toBe(99999);
    expect(q.taxPaise).toBe(applyBps(99999, 500)); // 5000 (4999.95 rounded)
    expect(q.taxPaise).toBe(5000);
    expect(q.shippingPaise).toBe(9900);
    expect(q.totalPaise).toBe(99999 + 5000 + 9900);
    expect(Number.isInteger(q.totalPaise)).toBe(true);
  });

  test('free shipping above ₹2000; discount price is used', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 10, price: 3000, discountPrice: 2500 });
    await addToCart(app, auth, p._id, 1);
    const q = await quote(app, auth);
    expect(q.lines[0].unitPricePaise).toBe(250000);
    expect(q.shippingPaise).toBe(0);
  });

  test('stale cart price: cart shows the change, checkout with the old total → 409 PRICE_CHANGED', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 10, price: 1000 });
    await addToCart(app, auth, p._id, 1);
    const oldQuote = await quote(app, auth);
    await Product.updateOne({ _id: p._id }, { $set: { price: 1200 } });

    const r = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', newKey())
      .send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: oldQuote.totalPaise });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PRICE_CHANGED');
    expect(r.body.details.quote.itemsPaise).toBe(120000);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(p._id)).stock).toBe(10);

    const cart = await request(app).get('/api/v1/cart').set(auth);
    expect(cart.body.changes[0]).toMatchObject({ type: 'PRICE_CHANGED', oldPrice: 1000, newPrice: 1200 });

    const ok = await checkoutCod(app, auth);
    expect(ok.status).toBe(201);
    expect(ok.body.data.pricing.itemsPaise).toBe(120000);
  });

  test('archived product in cart blocks checkout', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 10 });
    await addToCart(app, auth, p._id, 1);
    await Product.updateOne({ _id: p._id }, { $set: { isActive: false } });
    const q = await quote(app, auth);
    expect(q.problems[0].code).toBe('UNAVAILABLE');
    const r = await request(app).post('/api/v1/orders/checkout').set(auth).set('Idempotency-Key', newKey())
      .send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CART_INVALID');
  });

  test('invalid quantities are rejected by the cart', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 50 });
    for (const quantity of [0, -1, 1.5, 'abc', 21]) {
      const r = await request(app).post('/api/v1/cart').set(auth).send({ productId: String(p._id), quantity });
      expect(r.status).toBe(400);
    }
    const r = await request(app).post('/api/v1/cart').set(auth).send({ productId: String(p._id), quantity: 51 });
    expect(r.status).toBe(400);
  });
});

describe('coupons', () => {
  async function setup(couponFields, { price = 1000, qty = 2 } = {}) {
    const u = await createUser();
    const p = await createProduct({ stock: 20, price });
    await addToCart(app, u.auth, p._id, qty);
    const c = await Coupon.create({ code: 'CLAY10', type: 'PERCENT', value: 1000, ...couponFields });
    return { ...u, p, c };
  }

  test('percent coupon discounts items, tax is on the discounted amount, redemption recorded', async () => {
    const { auth } = await setup({});
    const q = await quote(app, auth, 'CLAY10');
    expect(q.discountPaise).toBe(20000);
    expect(q.taxPaise).toBe(applyBps(180000, 500));
    const r = await checkoutCod(app, auth, { couponCode: 'clay10' });
    expect(r.status).toBe(201);
    expect(r.body.data.pricing.couponCode).toBe('CLAY10');
    expect((await Coupon.findOne({ code: 'CLAY10' })).usedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ status: 'ACTIVE' })).toBe(1);
  });

  test('flat coupon with cap, min order, expiry and per-user limits', async () => {
    const { auth } = await setup({ type: 'FLAT', value: 50000, minOrderPaise: 300000 });
    let q = await quote(app, auth, 'CLAY10');
    expect(q.discountPaise).toBe(0);
    expect(q.problems[0].code).toBe('COUPON_INVALID');

    await Coupon.updateOne({ code: 'CLAY10' }, { $set: { minOrderPaise: 0, endsAt: new Date(Date.now() - 1000) } });
    q = await quote(app, auth, 'CLAY10');
    expect(q.problems[0].message).toMatch(/expired/);

    await Coupon.updateOne({ code: 'CLAY10' }, { $unset: { endsAt: 1 } });
    q = await quote(app, auth, 'CLAY10');
    expect(q.discountPaise).toBe(50000);
    expect((await checkoutCod(app, auth, { couponCode: 'CLAY10' })).status).toBe(201);

    // per-user limit 1: second use refused
    const p2 = await createProduct({ stock: 5 });
    await addToCart(app, auth, p2._id, 1);
    q = await quote(app, auth, 'CLAY10');
    expect(q.problems[0].message).toMatch(/already used/);
  });

  test('usage limit holds under concurrent checkouts', async () => {
    await Coupon.create({ code: 'ONLYONE', type: 'FLAT', value: 10000, usageLimit: 1 });
    const p = await createProduct({ stock: 20 });
    const users = await Promise.all(Array.from({ length: 4 }, () => createUser()));
    for (const u of users) await addToCart(app, u.auth, p._id, 1);
    const rs = await Promise.all(users.map((u) => checkoutCod(app, u.auth, { couponCode: 'ONLYONE' })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await Coupon.findOne({ code: 'ONLYONE' })).usedCount).toBe(1);
  });

  test('cancelling an order releases the coupon use exactly once', async () => {
    const { auth } = await setup({});
    const id = (await checkoutCod(app, auth, { couponCode: 'CLAY10' })).body.data._id;
    await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth);
    await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth);
    expect((await Coupon.findOne({ code: 'CLAY10' })).usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ status: 'RELEASED' })).toBe(1);
  });

  test('admin coupon management is admin-only and codes are validated', async () => {
    const admin = await createUser('admin');
    const { auth } = await createUser();
    expect((await request(app).post('/api/v1/admin/coupons').set(auth).send({ code: 'X1X', type: 'FLAT', value: 1 })).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/coupons').set(admin.auth).send({ code: 'bad code!', type: 'FLAT', value: 100 })).status).toBe(400);
    expect((await request(app).post('/api/v1/admin/coupons').set(admin.auth).send({ code: 'BIG', type: 'PERCENT', value: 20000 })).status).toBe(400);
    const ok = await request(app).post('/api/v1/admin/coupons').set(admin.auth).send({ code: 'monsoon15', type: 'PERCENT', value: 1500, isPublic: true });
    expect(ok.status).toBe(201);
    expect(ok.body.data.code).toBe('MONSOON15');
    const offers = await request(app).get('/api/v1/content/offers');
    expect(offers.body.data.map((o) => o.code)).toContain('MONSOON15');
  });
});
