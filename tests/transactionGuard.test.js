const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { createUser, createProduct, addToCart, checkoutCod } = require('./helpers/fixtures');

const app = createApp();

// A standalone mongod (no replica set) cannot run transactions. Money and
// stock writes must refuse with 503 rather than run without atomicity.
beforeAll(db.connectStandalone);
afterAll(db.disconnect);

test('checkout returns 503 on a non-replica-set database and writes nothing', async () => {
  const { auth } = await createUser();
  const p = await createProduct({ stock: 5 });
  await addToCart(app, auth, p._id, 1);
  const r = await checkoutCod(app, auth);
  expect(r.status).toBe(503);
  expect(r.body.message).toMatch(/replica set/);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Product.findById(p._id)).stock).toBe(5);
});

test('browsing still works and health reports transactions unavailable', async () => {
  await createProduct({ stock: 5 });
  const list = await request(app).get('/api/v1/products');
  expect(list.status).toBe(200);
  const h = await request(app).get('/api/v1/health');
  expect(h.body.transactions).toBe('unavailable');
});
