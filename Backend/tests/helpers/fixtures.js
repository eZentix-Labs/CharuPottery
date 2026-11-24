const crypto = require('crypto');
const request = require('supertest');
const User = require('../../models/User');
const Category = require('../../models/Category');
const Product = require('../../models/Product');
const InventoryMovement = require('../../models/InventoryMovement');
const { generateAccessToken } = require('../../utils/generateToken');

let seq = 0;

async function createUser(role = 'user', extra = {}) {
  seq += 1;
  const user = await User.create({
    name: `${role} ${seq}`,
    email: `${role}${seq}_${Date.now()}@example.test`,
    password: 'Passw0rd!',
    role,
    phone: '9876543210',
    ...extra,
  });
  return { user, token: generateAccessToken(user._id), auth: { Authorization: `Bearer ${generateAccessToken(user._id)}` } };
}

let category;
async function createProduct({ stock = 10, price = 1000, discountPrice, isActive = true, name } = {}) {
  if (!category || !(await Category.exists({ _id: category._id }))) {
    category = await Category.create({ name: `Cat ${Date.now()}-${Math.random()}` });
  }
  seq += 1;
  const p = await Product.create({
    name: name || `Test Pot ${seq}`,
    description: 'A handmade test pot',
    price,
    discountPrice,
    category: category._id,
    stock,
    isActive,
    images: [{ url: '/uploads/products/test.jpg' }],
  });
  await InventoryMovement.create({ itemModel: 'Product', item: p._id, type: 'INITIAL', quantity: stock, availableDelta: stock, availableAfter: stock, reservedAfter: 0 });
  return p;
}

const address = {
  fullName: 'Asha Rao',
  street: '12 Potter Lane, Kumbharwada',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'India',
  phone: '9876543210',
};

const newKey = () => crypto.randomUUID();

async function addToCart(app, auth, productId, quantity = 1) {
  const res = await request(app).post('/api/v1/cart').set(auth).send({ productId: String(productId), quantity });
  if (res.status !== 200) throw new Error(`addToCart failed: ${res.status} ${res.body.message}`);
  return res.body.data;
}

async function quote(app, auth, couponCode) {
  const res = await request(app).get('/api/v1/orders/checkout/quote').query(couponCode ? { couponCode } : {}).set(auth);
  if (res.status !== 200) throw new Error(`quote failed: ${res.status} ${res.body.message}`);
  return res.body.data;
}

/** Full COD checkout helper: quote then place order. */
async function checkoutCod(app, auth, { key = newKey(), couponCode, applyPrimeReward } = {}) {
  const q = await quote(app, auth, couponCode);
  return request(app)
    .post('/api/v1/orders/checkout')
    .set(auth)
    .set('Idempotency-Key', key)
    .send({ shippingAddress: address, paymentMethod: 'COD', expectedTotalPaise: q.totalPaise, couponCode, applyPrimeReward });
}

/** Sum of ledger deltas must equal current available stock. */
async function ledgerBalance(productId) {
  const rows = await InventoryMovement.find({ item: productId });
  return rows.reduce((s, r) => s + r.availableDelta, 0);
}

module.exports = { createUser, createProduct, address, newKey, addToCart, quote, checkoutCod, ledgerBalance };
