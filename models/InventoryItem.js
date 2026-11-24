const mongoose = require('mongoose');

/**
 * Non-product stock: packaging materials and any additional stock sections the
 * business adds (CP-ADMIN-020 / CP-ADMIN-021). `category` is free-form so admins
 * can create new sections ("Packaging", "Raw clay", "Glazes", …).
 */
const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 60, default: 'Packaging' },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    sku: { type: String, trim: true, maxlength: 60 },
    supplier: {
      name: { type: String, trim: true, maxlength: 120 },
      contact: { type: String, trim: true, maxlength: 120 },
    },
    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 10 },
    notes: { type: String, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ category: 1, name: 1 });
inventoryItemSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
