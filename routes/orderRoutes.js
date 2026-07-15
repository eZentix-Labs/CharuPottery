const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  getSalesAnalytics,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { orderValidation, validate } = require('../middleware/validators');

router.use(protect); // All order routes require login

router.post('/create-payment-intent', createPaymentIntent);
router.post('/', orderValidation, validate, createOrder);
router.get('/my-orders', getMyOrders);
router.put('/:id/cancel', cancelOrder);

// Admin only
router.get('/', authorize('admin'), getAllOrders);
router.get('/analytics/summary', authorize('admin'), getSalesAnalytics);
router.put('/:id/status', authorize('admin'), updateOrderStatus);

router.get('/:id', getOrder); // owner or admin check happens in controller

module.exports = router;
