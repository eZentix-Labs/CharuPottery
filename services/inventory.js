const mongoose = require('mongoose');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const InventoryMovement = require('../models/InventoryMovement');
const ApiError = require('../utils/ApiError');

/**
 * The ONLY module allowed to change Product.stock / reservedStock / soldCount
 * or InventoryItem.stock. Every change is a single conditional update (so it
 * can never drive a counter negative, even under concurrency) followed by a
 * ledger insert in the same session/transaction.
 */

function modelFor(itemModel) {
  return itemModel === 'InventoryItem' ? InventoryItem : Product;
}

function buildUpdate(type, q, itemModel) {
  const isProduct = itemModel === 'Product';
  switch (type) {
    case 'RESERVE':
      return { filter: { stock: { $gte: q }, ...(isProduct && { isActive: true }) }, inc: { stock: -q, reservedStock: q }, availableDelta: -q };
    case 'RELEASE':
      return { filter: { reservedStock: { $gte: q } }, inc: { stock: q, reservedStock: -q }, availableDelta: q };
    case 'COMMIT':
      return { filter: { reservedStock: { $gte: q } }, inc: { reservedStock: -q, soldCount: q }, availableDelta: 0 };
    case 'SALE':
      return { filter: { stock: { $gte: q }, ...(isProduct && { isActive: true }) }, inc: { stock: -q, ...(isProduct && { soldCount: q }) }, availableDelta: -q };
    case 'RETURN_TO_STOCK':
      return { filter: {}, inc: { stock: q, ...(isProduct && { soldCount: -q }) }, availableDelta: q };
    default:
      throw new Error(`Unsupported movement type ${type}`);
  }
}

/**
 * Apply an order-linked or system movement.
 * @returns the updated item document
 */
async function applyMovement({ session, itemModel = 'Product', itemId, type, quantity, order, actor, reason }) {
  const q = Number(quantity);
  if (!Number.isInteger(q) || q <= 0) throw new ApiError('Quantity must be a positive whole number.', 400);
  if (itemModel === 'InventoryItem' && ['RESERVE', 'RELEASE', 'COMMIT'].includes(type)) {
    throw new Error('Reservations apply to products only');
  }
  const { filter, inc, availableDelta } = buildUpdate(type, q, itemModel);
  const Model = modelFor(itemModel);

  const updated = await Model.findOneAndUpdate(
    { _id: itemId, ...filter },
    { $inc: inc },
    { new: true, session, runValidators: false }
  );

  if (!updated) {
    const current = await Model.findById(itemId).session(session).select('name stock reservedStock isActive');
    if (!current) throw new ApiError('Item not found.', 404);
    if (itemModel === 'Product' && current.isActive === false && ['RESERVE', 'SALE'].includes(type)) {
      throw new ApiError(`"${current.name}" is no longer available.`, 409, { code: 'UNAVAILABLE', details: { productId: String(itemId) } });
    }
    throw new ApiError(
      `Only ${current.stock} unit(s) of "${current.name}" available.`,
      409,
      { code: 'INSUFFICIENT_STOCK', details: { productId: String(itemId), available: current.stock } }
    );
  }

  await InventoryMovement.create(
    [
      {
        itemModel,
        item: itemId,
        type,
        quantity: q,
        availableDelta,
        availableAfter: updated.stock,
        reservedAfter: updated.reservedStock,
        reason,
        order,
        actor: actor?._id || actor,
        actorRole: actor?.role,
      },
    ],
    { session }
  );
  return updated;
}

/** Manual adjustment by a signed delta. Never allowed to go below zero. */
async function adjustStock({ session, itemModel = 'Product', itemId, delta, actor, reason }) {
  const d = Number(delta);
  if (!Number.isInteger(d) || d === 0) throw new ApiError('Adjustment must be a non-zero whole number.', 400);
  if (!reason || String(reason).trim().length < 3) throw new ApiError('A reason is required for stock adjustments.', 400);
  const Model = modelFor(itemModel);
  const filter = { _id: itemId, ...(d < 0 && { stock: { $gte: -d } }) };
  const updated = await Model.findOneAndUpdate(filter, { $inc: { stock: d } }, { new: true, session });
  if (!updated) {
    const exists = await Model.exists({ _id: itemId }).session(session);
    if (!exists) throw new ApiError('Item not found.', 404);
    throw new ApiError('Adjustment would make stock negative.', 409, { code: 'NEGATIVE_STOCK' });
  }
  await InventoryMovement.create(
    [{
      itemModel, item: itemId, type: 'ADJUSTMENT', quantity: Math.abs(d), availableDelta: d,
      availableAfter: updated.stock, reservedAfter: updated.reservedStock, reason: String(reason).trim(),
      actor: actor?._id || actor, actorRole: actor?.role,
    }],
    { session }
  );
  return updated;
}

/**
 * Compare-and-set: set available stock to `newStock` only if it is still
 * `expectedStock`. A concurrent sale between the admin's read and write makes
 * this fail with 409 instead of silently overwriting the sale.
 */
async function setStock({ session, itemModel = 'Product', itemId, expectedStock, newStock, actor, reason }) {
  const n = Number(newStock);
  const e = Number(expectedStock);
  if (!Number.isInteger(n) || n < 0) throw new ApiError('Stock must be a non-negative whole number.', 400);
  if (!Number.isInteger(e) || e < 0) throw new ApiError('expectedStock (the value you last saw) is required.', 400);
  if (n === e) {
    return modelFor(itemModel).findById(itemId).session(session);
  }
  const Model = modelFor(itemModel);
  const updated = await Model.findOneAndUpdate({ _id: itemId, stock: e }, { $set: { stock: n } }, { new: true, session });
  if (!updated) {
    const current = await Model.findById(itemId).session(session).select('stock');
    if (!current) throw new ApiError('Item not found.', 404);
    throw new ApiError(
      `Stock changed to ${current.stock} since you loaded it. Reload and try again.`,
      409,
      { code: 'STOCK_CHANGED', details: { currentStock: current.stock } }
    );
  }
  await InventoryMovement.create(
    [{
      itemModel, item: itemId, type: 'ADJUSTMENT', quantity: Math.abs(n - e), availableDelta: n - e,
      availableAfter: n, reservedAfter: updated.reservedStock, reason: reason ? String(reason).trim() : 'Stock count set by admin',
      actor: actor?._id || actor, actorRole: actor?.role,
    }],
    { session }
  );
  return updated;
}

/** Opening-balance entry for a newly created item. */
async function recordInitial({ session, itemModel = 'Product', item, actor }) {
  await InventoryMovement.create(
    [{
      itemModel, item: item._id, type: 'INITIAL', quantity: item.stock || 0, availableDelta: item.stock || 0,
      availableAfter: item.stock || 0, reservedAfter: item.reservedStock || 0, reason: 'Opening balance',
      actor: actor?._id || actor, actorRole: actor?.role,
    }],
    { session }
  );
}

function isObjectId(v) {
  return mongoose.isValidObjectId(v);
}

module.exports = { applyMovement, adjustStock, setStock, recordInitial, isObjectId };
