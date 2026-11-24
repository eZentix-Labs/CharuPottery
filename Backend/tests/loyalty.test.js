const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const User = require('../models/User');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const { createUser, createProduct, addToCart, checkoutCod } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

async function completedOrder(auth, admin, product) {
  await addToCart(app, auth, product._id, 1);
  const res = await checkoutCod(app, auth);
  const id = res.body.data._id;
  for (const s of ['Processing', 'Shipped', 'Delivered']) await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: s });
  await request(app).post(`/api/v1/orders/${id}/cod/collect`).set(admin.auth).send({ amountPaise: res.body.data.payment.amountPaise });
  return id;
}

describe('Prime Collection', () => {
  test('progress counts only delivered + paid orders; 5 qualifying → one reward', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 50 });
    for (let i = 0; i < 4; i += 1) await completedOrder(auth, admin, p);
    // a cancelled order and an unpaid delivered order must not count
    await addToCart(app, auth, p._id, 1);
    const cancelled = (await checkoutCod(app, auth)).body.data._id;
    await request(app).post(`/api/v1/orders/${cancelled}/cancel`).set(auth);

    let r = await request(app).get('/api/v1/account/loyalty').set(auth);
    expect(r.body.data).toMatchObject({ qualifyingPurchases: 4, rewardsAvailable: 0, purchasesUntilNextReward: 1, ruleStatus: 'PENDING_CLIENT_CONFIRMATION' });

    await completedOrder(auth, admin, p);
    r = await request(app).get('/api/v1/account/loyalty').set(auth);
    expect(r.body.data).toMatchObject({ qualifyingPurchases: 5, rewardsEarned: 1, rewardsAvailable: 1 });
    const q = await request(app).get('/api/v1/orders/checkout/quote').set(auth);
    expect(q.body.data.prime.rewardsAvailable).toBe(1);
  });

  test('reward redeems once; concurrent redemption attempts succeed only once', async () => {
    const { user, auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 50 });
    for (let i = 0; i < 5; i += 1) await completedOrder(auth, admin, p);
    await addToCart(app, auth, p._id, 1);
    const rs = await Promise.all(Array.from({ length: 3 }, () => checkoutCod(app, auth, { applyPrimeReward: true })));
    const ok = rs.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(ok[0].body.data.primeReward).toMatchObject({ applied: true, rewardNumber: 1 });
    expect((await User.findById(user._id)).loyalty.redeemedCount).toBe(1);
    expect(await LoyaltyLedger.countDocuments({ type: 'REDEEM' })).toBe(1);

    await addToCart(app, auth, p._id, 1);
    const again = await checkoutCod(app, auth, { applyPrimeReward: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_REWARD');
  });

  test('cancelling the reward order gives the reward back exactly once', async () => {
    const { user, auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 50 });
    for (let i = 0; i < 5; i += 1) await completedOrder(auth, admin, p);
    await addToCart(app, auth, p._id, 1);
    const id = (await checkoutCod(app, auth, { applyPrimeReward: true })).body.data._id;
    await request(app).post(`/api/v1/orders/${id}/cancel`).set(auth);
    await request(app).post(`/api/v1/orders/${id}/admin-cancel`).set(admin.auth);
    expect((await User.findById(user._id)).loyalty.redeemedCount).toBe(0);
    expect(await LoyaltyLedger.countDocuments({ type: 'REVERSE' })).toBe(1);
    const r = await request(app).get('/api/v1/account/loyalty').set(auth);
    expect(r.body.data.rewardsAvailable).toBe(1);
  });

  test('a refunded order stops counting', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 50 });
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push(await completedOrder(auth, admin, p));
    await request(app).post(`/api/v1/orders/${ids[0]}/refund`).set(admin.auth).send({ reason: 'damaged' });
    await request(app).post(`/api/v1/orders/${ids[0]}/refund/manual`).set(admin.auth).send({ outcome: 'SUCCEEDED', reference: 'UPI-1234' });
    expect((await Order.findById(ids[0])).payment.status).toBe('REFUNDED');
    const r = await request(app).get('/api/v1/account/loyalty').set(auth);
    expect(r.body.data.qualifyingPurchases).toBe(4);
    expect(r.body.data.rewardsAvailable).toBe(0);
  });
});
