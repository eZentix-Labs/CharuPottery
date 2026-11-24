const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../utils/pagination');
const { storeLocal } = require('../services/mediaStorage');
const { audit } = require('../services/audit');

/**
 * Reviews (CP-CUST-012/013, CP-ADMIN-012). Moderation policy is a pending
 * client decision (DEC-10). Default implemented here: every new or edited
 * review is held as `pending` until an admin approves it; only approved
 * reviews (and legacy reviews without a status) are public. "Verified
 * purchase" means the customer has a Delivered order containing the product.
 */

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;

function storeMedia(files) {
  return (files || []).slice(0, 4).map((f) => {
    const s = storeLocal(f.buffer, { folder: 'reviews', allow: ['image', 'video'], maxImageBytes: MAX_IMAGE, maxVideoBytes: MAX_VIDEO, prefix: 'review' });
    return { url: s.url, public_id: s.public_id, kind: s.kind, mime: s.mime, size: s.size };
  });
}

// @route GET /api/v1/products/:productId/reviews  (public: approved only)
exports.getProductReviews = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) throw new ApiError('Product not found.', 404);
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 10, max: 50 });
  const filter = { product: req.params.productId, ...Review.PUBLIC_FILTER };
  const [reviews, total] = await Promise.all([
    Review.find(filter).select('-reports -moderatedBy -moderationNote').populate('user', 'name avatar').sort('-createdAt').skip(skip).limit(limit),
    Review.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: reviews.length, total, page, pages: Math.ceil(total / limit), data: reviews });
});

// @route GET /api/v1/products/:productId/reviews/mine  (customer) — own review incl. pending
exports.getMyReview = asyncHandler(async (req, res) => {
  const review = await Review.findOne({ product: req.params.productId, user: req.user._id });
  const canReview = !review;
  const hasPurchased = await Order.exists({ user: req.user._id, 'orderItems.product': req.params.productId, orderStatus: { $in: ['Delivered'] } });
  res.status(200).json({ success: true, data: review, canReview, isVerifiedPurchase: !!hasPurchased });
});

// @route POST /api/v1/products/:productId/reviews  (multipart: rating, title, comment, media[])
exports.createReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) throw new ApiError('Product not found.', 404);
  const { rating, title, comment } = req.body;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw new ApiError('Product not found.', 404);

  const alreadyReviewed = await Review.findOne({ product: productId, user: req.user._id });
  if (alreadyReviewed) throw new ApiError('You have already reviewed this product.', 400);

  const hasPurchased = await Order.exists({ user: req.user._id, 'orderItems.product': productId, orderStatus: 'Delivered' });
  const media = storeMedia(req.files);

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    rating: Number(rating),
    title: title ? String(title).trim().slice(0, 100) : undefined,
    comment: String(comment).trim(),
    media,
    status: 'pending',
    isVerifiedPurchase: !!hasPurchased,
  });

  res.status(201).json({ success: true, data: review, message: 'Thank you! Your review will appear after moderation.' });
});

// @route PUT /api/v1/reviews/:id  (owner) — edits go back to moderation
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError('Review not found.', 404);
  if (String(review.user) !== String(req.user._id)) throw new ApiError('Not authorized to update this review.', 403);

  const { rating, title, comment } = req.body;
  if (rating !== undefined) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new ApiError('Rating must be between 1 and 5.', 400);
    review.rating = r;
  }
  if (title !== undefined) review.title = String(title).trim().slice(0, 100);
  if (comment !== undefined) {
    const c = String(comment).trim();
    if (c.length < 3 || c.length > 1000) throw new ApiError('Comment must be 3–1000 characters.', 400);
    review.comment = c;
  }
  review.status = 'pending';
  await review.save();
  res.status(200).json({ success: true, data: review });
});

// @route DELETE /api/v1/reviews/:id  (owner or admin)
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError('Review not found.', 404);
  const isAdmin = req.user.role === 'admin';
  if (String(review.user) !== String(req.user._id) && !isAdmin) throw new ApiError('Not authorized to delete this review.', 403);
  await Review.findOneAndDelete({ _id: review._id });
  if (isAdmin) await audit({ actor: req.user, action: 'review.delete', entity: 'Review', entityId: review._id, req });
  res.status(200).json({ success: true, message: 'Review deleted successfully.' });
});

// @route POST /api/v1/reviews/:id/report  { reason }  (any logged-in user, once)
exports.reportReview = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  if (reason.length < 3) throw new ApiError('Please tell us what is wrong with this review.', 400);
  const r = await Review.updateOne(
    { _id: req.params.id, 'reports.user': { $ne: req.user._id } },
    { $push: { reports: { user: req.user._id, reason } }, $inc: { reportCount: 1 } }
  );
  if (r.matchedCount === 0) {
    const exists = await Review.exists({ _id: req.params.id });
    if (!exists) throw new ApiError('Review not found.', 404);
    throw new ApiError('You have already reported this review.', 409);
  }
  res.status(200).json({ success: true, message: 'Thanks — our team will look at this review.' });
});

// ─── admin moderation ─────────────────────────────────────────────────────

// @route GET /api/v1/reviews/admin?status=pending|approved|rejected|reported
exports.getReviewsForModeration = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 20, max: 100 });
  const filter = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.status === 'reported') filter.reportCount = { $gt: 0 };
  const [rows, total] = await Promise.all([
    Review.find(filter).populate('user', 'name email').populate('product', 'name slug').sort('-createdAt').skip(skip).limit(limit),
    Review.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), data: rows });
});

// @route PATCH /api/v1/reviews/:id/moderate  { status: approved|rejected, note }
exports.moderateReview = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError('status must be approved or rejected.', 400);
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError('Review not found.', 404);
  const before = review.status;
  review.status = status;
  review.moderatedBy = req.user._id;
  review.moderatedAt = new Date();
  review.moderationNote = note ? String(note).slice(0, 300) : undefined;
  if (status === 'approved') {
    review.reports = [];
    review.reportCount = 0;
  }
  await review.save();
  await audit({ actor: req.user, action: 'review.moderate', entity: 'Review', entityId: review._id, before: { status: before }, after: { status }, req });
  res.status(200).json({ success: true, data: review });
});
