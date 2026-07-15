const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  updatePassword,
  addAddress,
  deleteAddress,
  getWishlist,
  toggleWishlist,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  registerValidation,
  loginValidation,
  validate,
} = require('../middleware/validators');

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/logout', protect, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);

router.get('/me', protect, getMe);
router.put('/update-profile', protect, updateProfile);
router.put('/update-password', protect, updatePassword);

router.post('/addresses', protect, addAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

router.get('/wishlist', protect, getWishlist);
router.put('/wishlist/:productId', protect, toggleWishlist);

module.exports = router;
