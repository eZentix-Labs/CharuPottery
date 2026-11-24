const express = require('express');
const c = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { reviewValidation, validate } = require('../middleware/validators');
const { reviewMediaUpload } = require('../middleware/uploadMiddleware');

// Mounted at /api/v1/reviews and at /api/v1/products/:productId/reviews
const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(c.getProductReviews)
  .post(protect, reviewMediaUpload.array('media', 4), reviewValidation, validate, c.createReview);

router.get('/mine', protect, c.getMyReview);
router.get('/admin', protect, authorize('admin'), c.getReviewsForModeration);
router.patch('/:id/moderate', protect, authorize('admin'), c.moderateReview);
router.post('/:id/report', protect, c.reportReview);
router.route('/:id').put(protect, c.updateReview).delete(protect, c.deleteReview);

module.exports = router;
