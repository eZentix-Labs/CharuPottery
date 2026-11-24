const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      maxlength: [100, 'Review title cannot exceed 100 characters'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      maxlength: [1000, 'Review comment cannot exceed 1000 characters'],
    },
    images: [{ url: String, public_id: String }],
    // Customer media (CP-CUST-013). Validated by content type on upload and
    // shown publicly only when the review is approved.
    media: [
      {
        url: String,
        public_id: String,
        kind: { type: String, enum: ['image', 'video'] },
        mime: String,
        size: Number,
      },
    ],
    // Moderation (DEC-10). Reviews created before moderation existed have no
    // status and are treated as approved.
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    moderationNote: { type: String, maxlength: 300 },
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, maxlength: 300 },
        at: { type: Date, default: Date.now },
      },
    ],
    reportCount: { type: Number, default: 0 },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Recalculate product's average rating whenever a review is saved/removed
reviewSchema.statics.recalculateProductRating = async function (productId) {
  const Product = mongoose.model('Product');
  const stats = await this.aggregate([
    { $match: { product: productId, $or: [{ status: 'approved' }, { status: { $exists: false } }] } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: stats[0].avgRating,
      ratingsQuantity: stats[0].numReviews,
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: 0,
      ratingsQuantity: 0,
    });
  }
};

reviewSchema.index({ status: 1, createdAt: -1 });

reviewSchema.statics.PUBLIC_FILTER = { $or: [{ status: 'approved' }, { status: { $exists: false } }] };

reviewSchema.post('save', function () {
  this.constructor.recalculateProductRating(this.product);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) doc.constructor.recalculateProductRating(doc.product);
});

module.exports = mongoose.model('Review', reviewSchema);
