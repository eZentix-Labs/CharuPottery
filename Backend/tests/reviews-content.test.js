const path = require('path');
const fs = require('fs');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');
const MessageCampaign = require('../models/MessageCampaign');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { createUser, createProduct, addToCart, checkoutCod } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const created = [];
afterAll(() => created.forEach((u) => fs.rmSync(path.join(__dirname, '..', u), { force: true })));

describe('reviews and moderation', () => {
  test('new review is pending (not public) until approved; then it counts in the rating', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct();
    const r = await request(app).post(`/api/v1/products/${p._id}/reviews`).set(auth)
      .field('rating', '5').field('comment', 'Beautiful glaze, arrived safely')
      .attach('media', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .attach('media', MP4, { filename: 'clip.mp4', contentType: 'video/mp4' });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('pending');
    expect(r.body.data.media.map((m) => m.kind)).toEqual(['image', 'video']);
    r.body.data.media.forEach((m) => created.push(m.url));

    let pub = await request(app).get(`/api/v1/products/${p._id}/reviews`);
    expect(pub.body.total).toBe(0);

    const queue = await request(app).get('/api/v1/reviews/admin').query({ status: 'pending' }).set(admin.auth);
    expect(queue.body.total).toBe(1);
    const mod = await request(app).patch(`/api/v1/reviews/${r.body.data._id}/moderate`).set(admin.auth).send({ status: 'approved' });
    expect(mod.status).toBe(200);
    pub = await request(app).get(`/api/v1/products/${p._id}/reviews`);
    expect(pub.body.total).toBe(1);
    await new Promise((res) => setTimeout(res, 300)); // rating recalculation runs after save
    expect((await Product.findById(p._id)).ratingsQuantity).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'review.moderate' })).toBe(1);
  });

  test('media validated by content: fake video/image rejected; customers cannot moderate', async () => {
    const { auth } = await createUser();
    const p = await createProduct();
    const bad = await request(app).post(`/api/v1/products/${p._id}/reviews`).set(auth)
      .field('rating', '4').field('comment', 'Nice')
      .attach('media', Buffer.from('MZ fake exe payload padding...'), { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(bad.status).toBe(400);
    expect(await Review.countDocuments()).toBe(0);
    const ok = await request(app).post(`/api/v1/products/${p._id}/reviews`).set(auth).send({ rating: 4, comment: 'Lovely mug' });
    expect((await request(app).patch(`/api/v1/reviews/${ok.body.data._id}/moderate`).set(auth).send({ status: 'approved' })).status).toBe(403);
  });

  test('verified purchase badge requires a delivered order; reports are once per user', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const reporter = await createUser();
    const p = await createProduct();
    await addToCart(app, auth, p._id, 1);
    const id = (await checkoutCod(app, auth)).body.data._id;
    for (const s of ['Processing', 'Shipped', 'Delivered']) await request(app).put(`/api/v1/orders/${id}/status`).set(admin.auth).send({ orderStatus: s });
    const r = await request(app).post(`/api/v1/products/${p._id}/reviews`).set(auth).send({ rating: 5, comment: 'Exactly as pictured' });
    expect(r.body.data.isVerifiedPurchase).toBe(true);
    const rid = r.body.data._id;
    expect((await request(app).post(`/api/v1/reviews/${rid}/report`).set(reporter.auth).send({ reason: 'spam link' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/reviews/${rid}/report`).set(reporter.auth).send({ reason: 'spam link' })).status).toBe(409);
    const reported = await request(app).get('/api/v1/reviews/admin').query({ status: 'reported' }).set(admin.auth);
    expect(reported.body.total).toBe(1);
  });
});

describe('brand content, banners and notifications', () => {
  test('brand content is validated (unsafe links rejected) and public', async () => {
    const admin = await createUser('admin');
    let r = await request(app).put('/api/v1/content/brand').set(admin.auth).send({ social: { instagram: 'javascript:alert(1)' } });
    expect(r.status).toBe(400);
    r = await request(app).put('/api/v1/content/brand').set(admin.auth).send({
      about: 'Handmade in Pune',
      founders: [{ name: 'Founder Name', role: 'Founder', bio: 'Potter for 10 years' }, { name: 'Co Founder', role: 'Co-Founder' }],
      workshop: { address: 'Workshop address', mapUrl: 'https://maps.example.com/x' },
      social: { instagram: 'https://instagram.com/example' },
      unknownField: 'dropped',
    });
    expect(r.status).toBe(200);
    const pub = await request(app).get('/api/v1/content/brand');
    expect(pub.body.data.founders).toHaveLength(2);
    expect(pub.body.data.unknownField).toBeUndefined();
  });

  test('banners: admin CRUD, only active + in-window banners are public', async () => {
    const admin = await createUser('admin');
    const img = { url: '/uploads/content/banner.jpg' };
    await request(app).post('/api/v1/content/admin/banners').set(admin.auth).send({ title: 'Diwali offer', image: img, sortOrder: 2 });
    await request(app).post('/api/v1/content/admin/banners').set(admin.auth).send({ title: 'New launch', image: img, sortOrder: 1 });
    await request(app).post('/api/v1/content/admin/banners').set(admin.auth).send({ title: 'Old', image: img, endsAt: new Date(Date.now() - 1000) });
    await request(app).post('/api/v1/content/admin/banners').set(admin.auth).send({ title: 'Off', image: img, isActive: false });
    const r = await request(app).get('/api/v1/content/banners');
    expect(r.body.data.map((b) => b.title)).toEqual(['New launch', 'Diwali offer']);
    expect((await request(app).post('/api/v1/content/admin/banners').set(admin.auth).send({ title: 'x', image: { url: 'http://insecure' } })).status).toBe(400);
  });

  test('site notifications: broadcast + order updates, read state per user', async () => {
    const admin = await createUser('admin');
    const { auth } = await createUser();
    await request(app).post('/api/v1/admin/notifications').set(admin.auth).send({ title: 'New coupon MONSOON15', type: 'coupon', link: '/products' });
    const p = await createProduct();
    await addToCart(app, auth, p._id, 1);
    await checkoutCod(app, auth);
    await new Promise((res) => setTimeout(res, 200));
    let r = await request(app).get('/api/v1/account/notifications').set(auth);
    expect(r.body.unread).toBe(2);
    await request(app).post('/api/v1/account/notifications/read-all').set(auth);
    r = await request(app).get('/api/v1/account/notifications').set(auth);
    expect(r.body.unread).toBe(0);
    expect(await Notification.countDocuments({ audience: 'all' })).toBe(1);
  });
});

describe('WhatsApp marketing (compliant integration point)', () => {
  test('no consent → never contacted; with consent → recorded as BLOCKED (no provider, no sending in tests)', async () => {
    const admin = await createUser('admin');
    const consenting = await createUser('user', { marketingConsent: { whatsapp: { optedIn: true, optedInAt: new Date(), source: 'test' } } });
    await createUser('user');
    const optedOut = await createUser('user', { marketingConsent: { whatsapp: { optedIn: false, optedInAt: new Date(Date.now() - 5000), optedOutAt: new Date() } } });
    const r = await request(app).post('/api/v1/admin/campaigns/whatsapp').set(admin.auth).send({ templateName: 'weekly_offer', templateParams: ['15%'] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'BLOCKED', eligibleCount: 1, suppressedCount: 2 });
    const c = await MessageCampaign.findById(r.body.data._id);
    expect(c.results.map((x) => String(x.user))).toEqual([String(consenting.user._id)]);
    expect(c.results.every((x) => x.outcome === 'BLOCKED')).toBe(true);
    expect(c.results.map((x) => String(x.user))).not.toContain(String(optedOut.user._id));
  });

  test('customer can opt in/out from their profile; opting in needs a phone number', async () => {
    const { user, auth } = await createUser('user', { phone: '' });
    let r = await request(app).put('/api/v1/account/consent').set(auth).send({ whatsapp: true });
    expect(r.status).toBe(400);
    await User.updateOne({ _id: user._id }, { phone: '9876543210' });
    r = await request(app).put('/api/v1/account/consent').set(auth).send({ whatsapp: true });
    expect(r.body.data.whatsapp.optedIn).toBe(true);
    r = await request(app).put('/api/v1/account/consent').set(auth).send({ whatsapp: false });
    expect(r.body.data.whatsapp.optedIn).toBe(false);
    expect(r.body.data.whatsapp.optedOutAt).toBeTruthy();
  });
});

describe('admin customer database', () => {
  test('lists customers with purchase totals, search, and audited detail view', async () => {
    const admin = await createUser('admin');
    const { auth, user } = await createUser();
    const p = await createProduct();
    await addToCart(app, auth, p._id, 1);
    await checkoutCod(app, auth);
    const list = await request(app).get('/api/v1/admin/customers').query({ q: user.email.slice(0, 6) }).set(admin.auth);
    expect(list.body.data[0]).toMatchObject({ email: user.email, orders: 1, paidPaise: 0 });
    expect(list.body.data[0].password).toBeUndefined();
    const detail = await request(app).get(`/api/v1/admin/customers/${user._id}`).set(admin.auth);
    expect(detail.body.data.orders).toHaveLength(1);
    expect(detail.body.data.customer.password).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'customer.view' })).toBe(1);
  });
});
