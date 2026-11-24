const mongoose = require('mongoose');

/**
 * Append-only stock ledger. Every change to Product.stock / reservedStock /
 * soldCount, or to an InventoryItem's stock, is written here in the same
 * transaction. Rows are never updated or deleted by application code.
 *
 * Types and their effect on a product:
 *   INITIAL          opening balance (stock = n)            available +n
 *   RESERVE          online checkout hold                   available -q, reserved +q
 *   RELEASE          hold released (expired / cancelled)    available +q, reserved -q
 *   COMMIT           hold converted to a sale on payment    reserved -q, sold +q
 *   SALE             direct sale (COD)                      available -q, sold +q
 *   RETURN_TO_STOCK  sold units restocked (cancel/return)   available +q, sold -q
 *   ADJUSTMENT       manual admin adjustment with reason    available ±q
 */
const MOVEMENT_TYPES = ['INITIAL', 'RESERVE', 'RELEASE', 'COMMIT', 'SALE', 'RETURN_TO_STOCK', 'ADJUSTMENT'];

const inventoryMovementSchema = new mongoose.Schema(
  {
    itemModel: { type: String, enum: ['Product', 'InventoryItem'], required: true, default: 'Product' },
    item: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'itemModel' },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 0 }, // always positive; the type gives the direction
    availableDelta: { type: Number, required: true },
    availableAfter: { type: Number, required: true, min: 0 },
    reservedAfter: { type: Number, min: 0 },
    reason: { type: String, maxlength: 500 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

inventoryMovementSchema.index({ item: 1, createdAt: -1 });
// An order can apply each movement type to each item at most once.
inventoryMovementSchema.index(
  { order: 1, item: 1, type: 1 },
  { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } }
);

inventoryMovementSchema.statics.MOVEMENT_TYPES = MOVEMENT_TYPES;

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
