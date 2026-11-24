const mongoose = require('mongoose');

/**
 * Website notifications (CP-ADMIN-031, in-site part).
 *   audience 'user' → one customer (e.g. order updates)
 *   audience 'all'  → broadcast (offers, new coupon codes, launches)
 * Per-user read state for broadcasts lives in `readBy`.
 */
const notificationSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ['user', 'all'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['order', 'offer', 'coupon', 'launch', 'update', 'system'], default: 'update' },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 600 },
    link: { type: String, maxlength: 300 },
    activeFrom: Date,
    activeUntil: Date,
    readAt: Date, // audience 'user'
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // audience 'all'
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

notificationSchema.index({ audience: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
