const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { registerValidation, loginValidation, addressValidation, passwordRule, validate } = require('../middleware/validators');

const router = express.Router();

// Brute-force protection for credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

router.post('/register', authLimiter, registerValidation, validate, c.register);
router.post('/login', authLimiter, loginValidation, validate, c.login);
router.post('/logout', protect, c.logout);
router.post('/refresh-token', c.refreshToken);
router.post('/forgot-password', authLimiter, c.forgotPassword);
router.put('/reset-password/:resetToken', authLimiter, passwordRule('password'), validate, c.resetPassword);

router.get('/me', protect, c.getMe);
router.put('/update-profile', protect, c.updateProfile);
router.put('/update-password', protect, passwordRule('newPassword'), validate, c.updatePassword);

router.post('/addresses', protect, addressValidation, validate, c.addAddress);
router.put('/addresses/:addressId', protect, c.updateAddress);
router.delete('/addresses/:addressId', protect, c.deleteAddress);

router.get('/wishlist', protect, c.getWishlist);
router.put('/wishlist/:productId', protect, c.toggleWishlist);

module.exports = router;
