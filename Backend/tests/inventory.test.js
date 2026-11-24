const request = require('supertest');
const { createApp } = require('../app');
const db = require('./helpers/db');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const InventoryItem = require('../models/InventoryItem');
const AuditLog = require('../models/AuditLog');
const { createUser, createProduct, addToCart, checkoutCod, ledgerBalance } = require('./helpers/fixtures');

const app = createApp();

beforeAll(db.connectReplSet);
afterAll(db.disconnect);
beforeEach(db.clearDb);

describe('overselling protection', () => {
  test('stock 1, five customers check out at the same time → exactly one order, stock 0', async () => {
    const p = await createProduct({ stock: 1, price: 500 });
    const buyers = await Promise.all(Array.from({ length: 5 }, () => createUser()));
    for (const b of buyers) await addToCart(app, b.auth, p._id, 1);
    const results = await Promise.all(buyers.map((b) => checkoutCod(app, b.auth)));
    const ok = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    const prod = await Product.findById(p._id);
    expect(prod.stock).toBe(0);
    expect(prod.soldCount).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await ledgerBalance(p._id)).toBe(0);
  });

  test('insufficient stock at checkout → 409 and nothing is written', async () => {
    const { auth } = await createUser();
    const p = await createProduct({ stock: 3 });
    const p2 = await createProduct({ stock: 5 });
    await addToCart(app, auth, p2._id, 2);
    await addToCart(app, auth, p._id, 3);
    await Product.updateOne({ _id: p._id }, { $set: { stock: 1 } }); // someone else bought them
    const r = await checkoutCod(app, auth);
    expect(r.status).toBe(409);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(p2._id)).stock).toBe(5); // first line rolled back
    expect(await InventoryMovement.countDocuments({ type: 'SALE' })).toBe(0);
  });

  test('two concurrent cancellations restock exactly once', async () => {
    const { auth } = await createUser();
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 4 });
    await addToCart(app, auth, p._id, 2);
    const id = (await checkoutCod(app, auth)).body.data._id;
    const rs = await Promise.all([
      request(app).post(`/api/v1/orders/${id}/cancel`).set(auth),
      request(app).post(`/api/v1/orders/${id}/admin-cancel`).set(admin.auth).send({ reason: 'duplicate' }),
      request(app).post(`/api/v1/orders/${id}/cancel`).set(auth),
    ]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Product.findById(p._id)).stock).toBe(4);
    expect(await InventoryMovement.countDocuments({ order: id, type: 'RETURN_TO_STOCK' })).toBe(1);
    expect(await ledgerBalance(p._id)).toBe(4);
  });
});

describe('admin stock changes', () => {
  test('set-stock is compare-and-set: a stale expectedStock gets 409, not a silent overwrite', async () => {
    const admin = await createUser('admin');
    const { auth } = await createUser();
    const p = await createProduct({ stock: 10 });
    // admin loads the product (sees 10), a customer then buys 2
    await addToCart(app, auth, p._id, 2);
    await checkoutCod(app, auth);
    const r = await request(app).patch(`/api/v1/products/${p._id}/stock`).set(admin.auth).send({ stock: 15, expectedStock: 10, reason: 'recount' });
    expect(r.status).toBe(409);
    expect(r.body.details.currentStock).toBe(8);
    expect((await Product.findById(p._id)).stock).toBe(8);

    const ok = await request(app).patch(`/api/v1/products/${p._id}/stock`).set(admin.auth).send({ stock: 15, expectedStock: 8, reason: 'recount' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.stock).toBe(15);
    expect(await ledgerBalance(p._id)).toBe(15);
    expect(await AuditLog.countDocuments({ action: 'stock.set' })).toBe(1);
  });

  test('adjustments need a reason and can never make stock negative', async () => {
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 3 });
    let r = await request(app).post(`/api/v1/products/${p._id}/stock-adjustments`).set(admin.auth).send({ delta: -2 });
    expect(r.status).toBe(400);
    r = await request(app).post(`/api/v1/products/${p._id}/stock-adjustments`).set(admin.auth).send({ delta: -5, reason: 'broken in kiln' });
    expect(r.status).toBe(409);
    r = await request(app).post(`/api/v1/products/${p._id}/stock-adjustments`).set(admin.auth).send({ delta: -2, reason: 'broken in kiln' });
    expect(r.status).toBe(200);
    expect(r.body.data.stock).toBe(1);
    const moves = await request(app).get(`/api/v1/products/${p._id}/stock-movements`).set(admin.auth);
    expect(moves.body.data[0]).toMatchObject({ type: 'ADJUSTMENT', availableDelta: -2, availableAfter: 1, reason: 'broken in kiln' });
    expect(await ledgerBalance(p._id)).toBe(1);
  });

  test('concurrent adjustments never drive stock below zero', async () => {
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 3 });
    const rs = await Promise.all(Array.from({ length: 6 }, () => request(app).post(`/api/v1/products/${p._id}/stock-adjustments`).set(admin.auth).send({ delta: -1, reason: 'damage check' })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(3);
    expect((await Product.findById(p._id)).stock).toBe(0);
    expect(await ledgerBalance(p._id)).toBe(0);
  });

  test('product edit cannot change stock/soldCount directly; stock edits go through the ledger', async () => {
    const admin = await createUser('admin');
    const p = await createProduct({ stock: 5 });
    const r = await request(app).put(`/api/v1/products/${p._id}`).set(admin.auth).send({ name: 'Renamed Pot', soldCount: 999, reservedStock: 7, stock: 9, expectedStock: 5 });
    expect(r.status).toBe(200);
    const prod = await Product.findById(p._id);
    expect(prod.name).toBe('Renamed Pot');
    expect(prod.soldCount).toBe(0);
    expect(prod.reservedStock).toBe(0);
    expect(prod.stock).toBe(9);
    expect(await ledgerBalance(p._id)).toBe(9);
  });
});

describe('packaging and additional stock sections', () => {
  test('admin creates packaging items in custom sections with ledgered adjustments and low-stock alerts', async () => {
    const admin = await createUser('admin');
    let r = await request(app).post('/api/v1/admin/inventory/items').set(admin.auth).send({ name: 'Bubble wrap roll', category: 'Packaging', unit: 'rolls', stock: 4, lowStockThreshold: 5 });
    expect(r.status).toBe(201);
    const id = r.body.data._id;
    await request(app).post('/api/v1/admin/inventory/items').set(admin.auth).send({ name: 'Red clay', category: 'Raw materials', unit: 'kg', stock: 50 });
    r = await request(app).post(`/api/v1/admin/inventory/items/${id}/adjust`).set(admin.auth).send({ delta: -10, reason: 'used' });
    expect(r.status).toBe(409);
    r = await request(app).post(`/api/v1/admin/inventory/items/${id}/adjust`).set(admin.auth).send({ delta: 6, reason: 'supplier delivery' });
    expect(r.body.data.stock).toBe(10);
    r = await request(app).get('/api/v1/admin/inventory/items').set(admin.auth);
    expect(r.body.categories.sort()).toEqual(['Packaging', 'Raw materials']);
    r = await request(app).get('/api/v1/admin/inventory/movements').query({ itemModel: 'InventoryItem', item: id }).set(admin.auth);
    expect(r.body.data.map((m) => m.type).sort()).toEqual(['ADJUSTMENT', 'INITIAL']);
    const item = await InventoryItem.findById(id);
    expect(item.stock).toBe(10);
  });
});
