const mongoose = require('mongoose');

/**
 * Admin-editable brand content stored as validated JSON per key:
 *   'brand' → about, story, founders, workshop, social links, social posts,
 *             weekly updates (CP-CUST-020…024)
 * The controller validates and normalises the shape before saving.
 */
const siteContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: ['brand'] },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model('SiteContent', siteContentSchema);
