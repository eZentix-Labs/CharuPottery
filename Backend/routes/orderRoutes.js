const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Checkout attempts are limited per IP to slow down abuse of stock holds.
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many checkout attempts. Please wait a few minutes.' },
});

router.use(protect);

// Customer
router.get('/checkout/quote', c.getQuote);
router.post('/checkout', checkoutLimiter, c.checkout);
router.post('/', checkoutLimiter, c.checkout); // legacy path → same validated checkout
router.get('/my-orders', c.getMyOrders);
router.post('/:id/cancel', c.cancelOrder);
router.put('/:id/cancel', c.cancelOrder); // legacy alias
router.post('/:id/payment/verify', c.verifyPayment);
router.post('/:id/payment/initiate', c.initiatePayment);

// Admin
const admin = authorize('admin');
router.get('/', admin, c.getAllOrders);
router.get('/analytics/summary', admin, c.getSalesAnalytics);
router.put('/:id/status', admin, c.updateOrderStatus);
router.post('/:id/admin-cancel', admin, c.adminCancel);
router.post('/:id/cod/collect', admin, c.confirmCodCollection);
router.post('/:id/refund', admin, c.adminRefund);
router.post('/:id/refund/retry', admin, c.retryRefund);
router.post('/:id/refund/reconcile', admin, c.reconcileRefund);
router.post('/:id/refund/manual', admin, c.recordManualRefund);
router.post('/:id/payment/reconcile', admin, c.reconcilePayment);
router.get('/:id/history', admin, c.getOrderHistory);

router.get('/:id', c.getOrder); // owner-or-admin check in the controller

module.exports = router;
