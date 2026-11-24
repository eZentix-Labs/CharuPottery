const mongoose = require('mongoose');

/**
 * Append-only record of sensitive actions (money, stock, permissions, content).
 * Never store secrets, tokens, passwords or full addresses here.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true }, // e.g. order.cancel, cod.collect, stock.adjust
    entity: { type: String, required: true }, // e.g. Order, Product
    entityId: { type: mongoose.Schema.Types.ObjectId },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
