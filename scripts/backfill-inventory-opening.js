/**
 * Writes one INITIAL InventoryMovement per existing product/inventory item
 * that has no ledger rows yet, so the ledger balance equals current stock.
 *
 *   node scripts/backfill-inventory-opening.js            # dry run (default)
 *   node scripts/backfill-inventory-opening.js --apply    # insert rows
 *
 * Safety: insert-only, never changes stock; refuses non-local databases
 * unless --i-understand-target=<host> names the exact host (e.g. after a
 * backup has been taken and the owner approved running it).
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const host = new URL(uri.replace(/^mongodb\+srv:/, 'http:').replace(/^mongodb:/, 'http:')).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  const allowed = process.argv.find((a) => a.startsWith('--i-understand-target='))?.split('=')[1];
  if (!local && allowed !== host) throw new Error(`Refusing to run against ${host}. Pass --i-understand-target=${host} only with owner approval and a fresh backup.`);
  const apply = process.argv.includes('--apply');

  await mongoose.connect(uri);
  const Product = require('../models/Product');
  const InventoryItem = require('../models/InventoryItem');
  const InventoryMovement = require('../models/InventoryMovement');

  let planned = 0;
  for (const [Model, itemModel] of [[Product, 'Product'], [InventoryItem, 'InventoryItem']]) {
    for await (const doc of Model.find().select('name stock reservedStock').cursor()) {
      if (await InventoryMovement.exists({ item: doc._id })) continue;
      planned += 1;
      console.log(`${apply ? 'INSERT' : 'WOULD INSERT'} INITIAL ${itemModel} ${doc._id} stock=${doc.stock}`);
      if (apply) {
        await InventoryMovement.create({ itemModel, item: doc._id, type: 'INITIAL', quantity: doc.stock || 0, availableDelta: doc.stock || 0, availableAfter: doc.stock || 0, reservedAfter: doc.reservedStock || 0, reason: 'Opening balance (backfill)' });
      }
    }
  }
  console.log(`${planned} item(s) ${apply ? 'backfilled' : 'would be backfilled (dry run — add --apply)'}.`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
