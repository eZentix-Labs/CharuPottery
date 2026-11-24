const mongoose = require('mongoose');

/** Homepage promotional banner carousel (CP-CUST-002), admin-managed. */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    subtitle: { type: String, trim: true, maxlength: 200 },
    image: { url: { type: String, required: true }, public_id: String, altText: { type: String, maxlength: 150 } },
    link: { type: String, maxlength: 300 },
    ctaLabel: { type: String, maxlength: 40 },
    placement: { type: String, enum: ['home_hero', 'home_offer'], default: 'home_hero' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

bannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
