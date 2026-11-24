const path = require('path');
const fs = require('fs');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const InventoryMovement = require('../models/InventoryMovement');
const { createUser, createProduct } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

// Minimal valid PNG (1×1)
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');
const createdFiles = [];
afterAll(() => {
  for (const f of createdFiles) fs.rmSync(path.join(__dirname, '..', f), { force: true });
});

describe('admin product management', () => {
  test('create with images (multipart) → product, verified image stored, opening ledger entry', async () => {
    const admin = await createUser('admin');
    const cat = await Category.create({ name: 'Vases' });
    const r = await request(app)
      .post('/api/v1/products')
      .set(admin.auth)
      .field('name', 'Terracotta Vase')
      .field('description', 'Wheel-thrown terracotta vase')
      .field('price', '1299')
      .field('category', String(cat._id))
      .field('stock', '7')
      .field('dimensions.height', '25')
      .field('isFeatured', 'true')
      .attach('images', PNG, { filename: 'vase.png', contentType: 'image/png' });
    expect(r.status).toBe(201);
    const p = r.body.data;
    createdFiles.push(p.images[0].url);
    expect(p.images[0].url).toMatch(/^\/uploads\/products\/product-.*\.png$/);
    expect(p.dimensions.height).toBe(25);
    expect(p.isFeatured).toBe(true);
    expect(await InventoryMovement.countDocuments({ item: p._id, type: 'INITIAL', availableAfter: 7 })).toBe(1);
  });

  test('a disguised non-image upload is rejected even with an image mimetype', async () => {
    const admin = await createUser('admin');
    const cat = await Category.create({ name: 'Mugs' });
    const r = await request(app)
      .post('/api/v1/products')
      .set(admin.auth)
      .field('name', 'Mug')
      .field('description', 'Mug')
      .field('price', '499')
      .field('category', String(cat._id))
      .field('stock', '1')
      .attach('images', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.png', contentType: 'image/png' });
    expect(r.status).toBe(400);
    expect(await Product.countDocuments()).toBe(0);
  });

  test('existingImages cannot inject javascript: or foreign protocol URLs', async () => {
    const admin = await createUser('admin');
    const p = await createProduct();
    const r = await request(app).put(`/api/v1/products/${p._id}`).set(admin.auth)
      .field('existingImages', JSON.stringify([{ url: 'javascript:alert(1)' }, { url: '/uploads/products/ok.jpg' }]));
    expect(r.status).toBe(200);
    expect(r.body.data.images.map((i) => i.url)).toEqual(['/uploads/products/ok.jpg']);
  });

  test('archive hides from the storefront; permanent delete refused once history exists', async () => {
    const admin = await createUser('admin');
    const p = await createProduct();
    await request(app).delete(`/api/v1/products/${p._id}`).set(admin.auth);
    expect((await request(app).get(`/api/v1/products/${p._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/products/${p._id}`).set(admin.auth)).status).toBe(200);
    expect((await request(app).get('/api/v1/products')).body.total).toBe(0);
    const admList = await request(app).get('/api/v1/products/admin/all').query({ status: 'archived' }).set(admin.auth);
    expect(admList.body.total).toBe(1);
    await InventoryMovement.create({ itemModel: 'Product', item: p._id, type: 'ADJUSTMENT', quantity: 1, availableDelta: 1, availableAfter: 11 });
    expect((await request(app).delete(`/api/v1/products/${p._id}/permanent`).set(admin.auth)).status).toBe(409);
  });
});

describe('public catalogue', () => {
  test('filters are whitelisted (isActive cannot be overridden) and page size is capped', async () => {
    await createProduct({ isActive: false, name: 'Hidden' });
    for (let i = 0; i < 3; i += 1) await createProduct({ price: 500 + i * 1000 });
    let r = await request(app).get('/api/v1/products').query({ isActive: 'false' });
    expect(r.body.data.map((p) => p.name)).not.toContain('Hidden');
    r = await request(app).get('/api/v1/products?stock[gt]=-1&limit=100000');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(48);
    r = await request(app).get('/api/v1/products').query({ 'price[gte]': 1000, sort: 'price' });
    expect(r.body.data.map((p) => p.price)).toEqual([1500, 2500]);
    r = await request(app).get('/api/v1/products').query({ sort: '-__proto__' });
    expect(r.status).toBe(200);
  });

  test('operator injection in query/body is neutralised', async () => {
    await createProduct();
    const r = await request(app).get('/api/v1/products?category[$ne]=x');
    expect(r.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(login.status).toBe(400);
  });

  test('availability, featured, new arrivals and related products', async () => {
    const a = await createProduct({ stock: 0 });
    await Product.updateOne({ _id: a._id }, { isFeatured: true });
    const b = await createProduct({ stock: 3 });
    expect((await request(app).get('/api/v1/products').query({ inStock: 'true' })).body.data.map((p) => p._id)).toEqual([String(b._id)]);
    const f = await request(app).get('/api/v1/products/featured');
    expect(f.body.data[0].inStock).toBe(false);
    expect((await request(app).get('/api/v1/products/new-arrivals')).body.data.length).toBe(2);
    expect((await request(app).get(`/api/v1/products/${a._id}/related`)).body.data.map((p) => p._id)).toEqual([String(b._id)]);
  });
});
