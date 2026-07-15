const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');
const { reviewValidation, validate } = require('../middleware/validators');

router
  .route('/')
  .get(getProductReviews)
  .post(protect, reviewValidation, validate, createReview);

router.route('/:id').put(protect, updateReview).delete(protect, deleteReview);

module.exports = router;
