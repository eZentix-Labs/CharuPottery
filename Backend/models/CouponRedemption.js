const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    discountPaise: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'RELEASED'], default: 'ACTIVE' },
    releasedAt: Date,
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ order: 1 }, { unique: true });
couponRedemptionSchema.index({ coupon: 1, user: 1, status: 1 });

module.exports = mongoose.model('CouponRedemption', couponRedemptionSchema);
