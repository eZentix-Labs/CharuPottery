/**
 * LOCAL DEVELOPMENT ONLY — runs the API against a throwaway in-memory MongoDB
 * replica set (so transactions work) when MongoDB is not installed locally.
 *
 *   npm run dev:memory
 *
 * - Never connects to MONGO_URI from .env (ignored on purpose).
 * - Seeds an admin account and a few clearly-labelled sample products.
 *   The admin password is taken from DEV_ADMIN_PASSWORD or generated and
 *   printed once to this console. Nothing persists after the process exits.
 * - Data directory: the OS temp folder (set TEMP/TMP to a drive with space).
 */
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('dev-memory-server refuses to run with NODE_ENV=production');
  process.exit(1);
}

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');

  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dev-mongo-'));
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ dbPath }] });
  await mongoose.connect(rs.getUri('charu_dev'));
  console.log('In-memory MongoDB replica set ready (data is discarded on exit).');

  const User = require('../models/User');
  const Category = require('../models/Category');
  const Product = require('../models/Product');
  const InventoryMovement = require('../models/InventoryMovement');
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));

  const adminEmail = process.env.DEV_ADMIN_EMAIL || 'admin@dev.local';
  const adminPassword = process.env.DEV_ADMIN_PASSWORD || `Dev${crypto.randomBytes(6).toString('hex')}9`;
  const admin = await User.create({ name: 'Dev Admin', email: adminEmail, password: adminPassword, role: 'admin', phone: '9000000000' });
  console.log(`Dev admin: ${adminEmail} / ${process.env.DEV_ADMIN_PASSWORD ? '(from DEV_ADMIN_PASSWORD)' : adminPassword}`);

  if (process.env.DEV_DEMO_CATALOG !== 'false') {
    const { seedDemoCatalog } = require('./demo-catalog');
    const models = {
      Category, Product, InventoryMovement, User,
      Banner: require('../models/Banner'),
      SiteContent: require('../models/SiteContent'),
      Coupon: require('../models/Coupon'),
      Review: require('../models/Review'),
      Notification: require('../models/Notification'),
    };
    const r = await seedDemoCatalog(models, { admin });
    console.log(`Demo catalogue loaded: ${r.categories} categories, ${r.products} products, ${r.reviews} reviews, banners, offers and brand content.`);
  } else {
  const [vases, mugs] = await Category.create([{ name: 'Vases' }, { name: 'Mugs & Cups' }]);
  const samples = [
    { name: '[SAMPLE] Terracotta Vase', price: 1499, discountPrice: 1199, category: vases._id, stock: 5, isFeatured: true, isNewArrival: true, clayType: 'Terracotta' },
    { name: '[SAMPLE] Stoneware Mug', price: 599, category: mugs._id, stock: 12, isFeatured: true, clayType: 'Stoneware' },
    { name: '[SAMPLE] Last-piece Bowl', price: 2499, category: vases._id, stock: 1, isNewArrival: true, clayType: 'Earthenware' },
  ];
  for (const s of samples) {
    const p = await Product.create({ ...s, description: 'Development placeholder product — replace with real catalogue content.', images: [{ url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600&q=60', altText: s.name }] });
    await InventoryMovement.create({ itemModel: 'Product', item: p._id, type: 'INITIAL', quantity: p.stock, availableDelta: p.stock, availableAfter: p.stock, reservedAfter: 0, reason: 'Dev seed' });
  }
  }

  const { createApp } = require('../app');
  const { startReservationSweeper } = require('../services/reservationSweeper');
  const app = createApp();
  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => console.log(`Dev API on http://localhost:${port}/api/v1 (health: /api/v1/health)`));
  const sweeper = startReservationSweeper();

  const stop = async () => {
    clearInterval(sweeper);
    server.close();
    await mongoose.disconnect();
    await rs.stop({ doCleanup: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('dev-memory-server failed:', err.message);
  process.exit(1);
});
