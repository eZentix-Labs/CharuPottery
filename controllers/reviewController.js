const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');

// @desc    Get all reviews for a product
// @route   GET /api/v1/products/:productId/reviews
// @access  Public
exports.getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ product: req.params.productId })
    .populate('user', 'name avatar')
    .sort('-createdAt');

  res.status(200).json({ success: true, count: reviews.length, data: reviews });
});

// @desc    Create a review for a product
// @route   POST /api/v1/products/:productId/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, title, comment } = req.body;

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  const alreadyReviewed = await Review.findOne({
    product: productId,
    user: req.user.id,
  });
  if (alreadyReviewed) {
    throw new ApiError('You have already reviewed this product.', 400);
  }

  // Check if user actually purchased this product (verified purchase badge)
  const hasPurchased = await Order.exists({
    user: req.user.id,
    'orderItems.product': productId,
    isPaid: true,
  });

  const review = await Review.create({
    product: productId,
    user: req.user.id,
    rating,
    title,
    comment,
    isVerifiedPurchase: !!hasPurchased,
  });

  res.status(201).json({ success: true, data: review });
});

// @desc    Update own review
// @route   PUT /api/v1/reviews/:id
// @access  Private
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError('Review not found.', 404);
  }
  if (review.user.toString() !== req.user.id) {
    throw new ApiError('Not authorized to update this review.', 403);
  }

  const { rating, title, comment } = req.body;
  if (rating) review.rating = rating;
  if (title) review.title = title;
  if (comment) review.comment = comment;

  await review.save();
  res.status(200).json({ success: true, data: review });
});

// @desc    Delete own review (or admin can delete any)
// @route   DELETE /api/v1/reviews/:id
// @access  Private
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError('Review not found.', 404);
  }
  if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError('Not authorized to delete this review.', 403);
  }

  await Review.findOneAndDelete({ _id: review._id });

  res.status(200).json({ success: true, message: 'Review deleted successfully.' });
});
