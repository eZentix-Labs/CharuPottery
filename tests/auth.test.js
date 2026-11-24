const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const db = require('./helpers/db');
const User = require('../models/User');
const { createUser } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

const cookieValue = (res, name) => {
  const c = (res.headers['set-cookie'] || []).find((s) => s.startsWith(`${name}=`));
  return c ? c.split(';')[0].split('=')[1] : null;
};

describe('registration and login', () => {
  test('register creates a customer (role from the request is ignored) and returns a token', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'Meera', email: 'meera@charu.store', password: 'Clay2026x', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.user.role).toBe('user');
    expect((await User.findOne({ email: 'meera@charu.store' })).role).toBe('user');
  });

  test('weak passwords, bad emails and duplicate accounts are rejected', async () => {
    expect((await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'a@x.com', password: 'short1' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'a@x.com', password: 'onlyletters' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'not-an-email', password: 'Clay2026x' })).status).toBe(400);
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'a@x.com', password: 'Clay2026x' });
    expect((await request(app).post('/api/v1/auth/register').send({ name: 'B', email: 'a@x.com', password: 'Clay2026x' })).status).toBe(400);
  });

  test('WhatsApp opt-in is recorded only when explicitly given with a phone number', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'opt@x.com', password: 'Clay2026x', phone: '9876543210', whatsappOptIn: true });
    await request(app).post('/api/v1/auth/register').send({ name: 'B', email: 'noopt@x.com', password: 'Clay2026x', phone: '9876543210' });
    expect((await User.findOne({ email: 'opt@x.com' })).marketingConsent.whatsapp.optedIn).toBe(true);
    expect((await User.findOne({ email: 'noopt@x.com' })).marketingConsent.whatsapp.optedIn).toBe(false);
  });

  test('login works; invalid credentials → 401 without revealing which part was wrong', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'login@x.com', password: 'Clay2026x' });
    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'login@x.com', password: 'Clay2026x' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/v1/auth/login').send({ email: 'login@x.com', password: 'wrong123' });
    const missing = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@x.com', password: 'wrong123' });
    expect(bad.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(bad.body.message).toBe(missing.body.message);
  });

  test('deactivated users cannot log in or use existing tokens', async () => {
    const { user, auth } = await createUser();
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Passw0rd!' })).status).toBe(403);
  });
});

describe('tokens and sessions', () => {
  test('missing, invalid and expired tokens → 401', async () => {
    const { user } = await createUser();
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const expired = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    const wrongSecret = jwt.sign({ id: user._id }, 'not-the-secret');
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${wrongSecret}`)).status).toBe(401);
  });

  test('refresh token works until logout, then is revoked', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'r@x.com', password: 'Clay2026x' });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'r@x.com', password: 'Clay2026x' });
    const refresh = cookieValue(login, 'refreshToken');
    expect(refresh).toBeTruthy();
    const r1 = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: refresh });
    expect(r1.status).toBe(200);
    await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.accessToken}`);
    const r2 = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: refresh });
    expect(r2.status).toBe(401);
  });

  test('forgot-password gives the same answer for unknown emails (no enumeration)', async () => {
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@x.com' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/If an account exists/);
  });
});

describe('role restrictions', () => {
  test('anonymous → 401 and customers → 403 on every admin surface', async () => {
    const { auth } = await createUser();
    const adminGets = ['/api/v1/admin/dashboard', '/api/v1/admin/customers', '/api/v1/admin/coupons', '/api/v1/admin/inventory/items', '/api/v1/admin/audit', '/api/v1/orders', '/api/v1/products/admin/all', '/api/v1/reviews/admin', '/api/v1/content/admin/banners'];
    for (const path of adminGets) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set(auth)).status).toBe(403);
    }
    expect((await request(app).post('/api/v1/products').set(auth).send({})).status).toBe(403);
    expect((await request(app).post('/api/v1/categories').set(auth).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).put('/api/v1/content/brand').set(auth).send({})).status).toBe(403);
  });

  test('profile update cannot escalate role', async () => {
    const { user, auth } = await createUser();
    await request(app).put('/api/v1/auth/update-profile').set(auth).send({ name: 'New', role: 'admin', isActive: true });
    expect((await User.findById(user._id)).role).toBe('user');
  });
});

describe('addresses and wishlist', () => {
  test('address book: validation, default handling, update and delete', async () => {
    const { auth } = await createUser();
    const bad = await request(app).post('/api/v1/auth/addresses').set(auth).send({ street: 'x', city: 'P', state: 'M', postalCode: '1', phone: '1' });
    expect(bad.status).toBe(400);
    const a = { street: '12 Potter Lane', city: 'Pune', state: 'Maharashtra', postalCode: '411001', phone: '9876543210' };
    let r = await request(app).post('/api/v1/auth/addresses').set(auth).send(a);
    expect(r.body.data[0].isDefault).toBe(true);
    r = await request(app).post('/api/v1/auth/addresses').set(auth).send({ ...a, label: 'Work', isDefault: true });
    expect(r.body.data.filter((x) => x.isDefault)).toHaveLength(1);
    const workId = r.body.data.find((x) => x.label === 'Work')._id;
    r = await request(app).put(`/api/v1/auth/addresses/${workId}`).set(auth).send({ city: 'Nashik' });
    expect(r.body.data.find((x) => x._id === workId).city).toBe('Nashik');
    r = await request(app).delete(`/api/v1/auth/addresses/${workId}`).set(auth);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].isDefault).toBe(true);
  });

  test('wishlist toggles and rejects unknown products', async () => {
    const { createProduct } = require('./helpers/fixtures');
    const { auth } = await createUser();
    const p = await createProduct();
    let r = await request(app).put(`/api/v1/auth/wishlist/${p._id}`).set(auth);
    expect(r.body.data).toHaveLength(1);
    r = await request(app).put(`/api/v1/auth/wishlist/${p._id}`).set(auth);
    expect(r.body.data).toHaveLength(0);
    expect((await request(app).put('/api/v1/auth/wishlist/64b000000000000000000000').set(auth)).status).toBe(404);
  });
});
