const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const { createUser, createProduct, address } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

// Orders created by the previous code: no `payment` block, no ledger rows,
// stock already decremented at placement.
async function legacyOrder(user, product, { paymentMethod = 'COD', isPaid = false, qty = 2 } = {}) {
  await Product.updateOne({ _id: product._id }, { $inc: { stock: -qty, soldCount: qty } });
  return Order.create({
    user: user._id,
    orderItems: [{ product: product._id, name: product.name, image: '', price: 1000, quantity: qty }],
    shippingAddress: address,
    paymentMethod,
    itemsPrice: 2000, taxPrice: 100, shippingPrice: 99, totalPrice: 2199,
    isPaid,
    orderStatus: 'Pending',
  });
}

test('cancelling a legacy order restocks exactly once and never claims a refund', async () => {
  const { user, auth } = await createUser();
  const p = await createProduct({ stock: 10 });
  const o = await legacyOrder(user, p);
  expect((await Product.findById(p._id)).stock).toBe(8);
  const r = await request(app).post(`/api/v1/orders/${o._id}/cancel`).set(auth);
  expect(r.status).toBe(200);
  expect(r.body.data.orderStatus).toBe('Cancelled');
  expect((await Product.findById(p._id)).stock).toBe(10);
  expect((await request(app).post(`/api/v1/orders/${o._id}/cancel`).set(auth)).status).toBe(409);
  expect((await Product.findById(p._id)).stock).toBe(10);
  expect(await InventoryMovement.countDocuments({ order: o._id, type: 'RETURN_TO_STOCK' })).toBe(1);
  const fresh = await Order.findById(o._id);
  expect(fresh.payment).toBeUndefined();
});

test('falsely-paid legacy card order: cancel restocks but no refund state is invented', async () => {
  const { user } = await createUser();
  const admin = await createUser('admin');
  const p = await createProduct({ stock: 5 });
  const o = await legacyOrder(user, p, { paymentMethod: 'Stripe', isPaid: true, qty: 1 });
  const r = await request(app).post(`/api/v1/orders/${o._id}/admin-cancel`).set(admin.auth).send({ reason: 'legacy review' });
  expect(r.status).toBe(200);
  const fresh = await Order.findById(o._id);
  expect(fresh.payment).toBeUndefined();
  expect((await Product.findById(p._id)).stock).toBe(5);
});

test('legacy unpaid COD order can have its cash collection recorded once', async () => {
  const { user } = await createUser();
  const admin = await createUser('admin');
  const p = await createProduct({ stock: 5 });
  const o = await legacyOrder(user, p);
  for (const s of ['Processing', 'Shipped', 'Delivered']) await request(app).put(`/api/v1/orders/${o._id}/status`).set(admin.auth).send({ orderStatus: s });
  const r = await request(app).post(`/api/v1/orders/${o._id}/cod/collect`).set(admin.auth).send({ amountPaise: 219900 });
  expect(r.status).toBe(200);
  expect(r.body.data.payment.status).toBe('PAID');
  expect((await request(app).post(`/api/v1/orders/${o._id}/cod/collect`).set(admin.auth).send({ amountPaise: 219900 })).status).toBe(409);
});
