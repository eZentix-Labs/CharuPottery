const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{3,30}$/ },
    description: { type: String, maxlength: 300 },
    type: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
    // PERCENT: basis points (1000 = 10%). FLAT: paise.
    value: { type: Number, required: true, min: 1 },
    maxDiscountPaise: { type: Number, min: 0 }, // cap for PERCENT coupons
    minOrderPaise: { type: Number, min: 0, default: 0 },
    startsAt: Date,
    endsAt: Date,
    usageLimit: { type: Number, min: 1 }, // total redemptions across all customers
    perUserLimit: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: false }, // shown in the storefront offers section
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

couponSchema.pre('validate', function (next) {
  if (this.type === 'PERCENT' && this.value > 10000) {
    this.invalidate('value', 'Percent coupons cannot exceed 100%');
  }
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate('endsAt', 'Coupon end date must be after the start date');
  }
  next();
});

module.exports = mongoose.model('Coupon', couponSchema);
