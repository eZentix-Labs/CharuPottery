const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { sendTokenResponse, generateAccessToken } = require('../utils/generateToken');

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, whatsappOptIn } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError('An account with this email already exists.', 400);
  }

  // Role is never taken from the request: new accounts are always customers.
  const user = await User.create({
    name,
    email,
    password,
    phone: phone || '',
    ...(whatsappOptIn === true && phone && {
      marketingConsent: { whatsapp: { optedIn: true, optedInAt: new Date(), source: 'register' } },
    }),
  });

  sendTokenResponse(user, 201, res);
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError('Please provide both email and password.', 400);
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError('Invalid email or password.', 401);
  }

  if (!user.isActive) {
    throw new ApiError('This account has been deactivated. Contact support.', 403);
  }

  sendTokenResponse(user, 200, res);
});

// @desc    Logout user / clear cookies
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res) => {
  // Revoke every refresh token issued so far for this user.
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.cookie('accessToken', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });
  res.cookie('refreshToken', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });

  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// @desc    Refresh access token using refresh token
// @route   POST /api/v1/auth/refresh-token
// @access  Public (requires valid refresh token cookie)
exports.refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;

  if (!token) {
    throw new ApiError('No refresh token provided.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new ApiError('Refresh token is invalid or expired. Please log in again.', 401);
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    throw new ApiError('User no longer exists.', 401);
  }
  if ((decoded.tv || 0) !== (user.tokenVersion || 0)) {
    throw new ApiError('Session has ended. Please log in again.', 401);
  }

  const accessToken = generateAccessToken(user._id);
  res.status(200).json({ success: true, accessToken });
});

// @desc    Get current logged-in user profile
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate(
    'wishlist',
    'name price images slug'
  );
  res.status(200).json({ success: true, data: user });
});

// @desc    Update current user profile (name, phone, avatar)
// @route   PUT /api/v1/auth/update-profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'phone'];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, data: user });
});

// @desc    Update password
// @route   PUT /api/v1/auth/update-password
// @access  Private
exports.updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  if (!currentPassword || !(await user.matchPassword(currentPassword))) {
    throw new ApiError('Your current password is incorrect.', 401);
  }

  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // sign out other sessions
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Manage shipping addresses (add)
// @route   POST /api/v1/auth/addresses
// @access  Private
const ADDRESS_FIELDS = ['label', 'street', 'city', 'state', 'postalCode', 'country', 'phone', 'isDefault'];
const pickAddress = (body) => {
  const out = {};
  for (const k of ADDRESS_FIELDS) if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  return out;
};

exports.addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.addresses.length >= 10) throw new ApiError('You can save at most 10 addresses.', 400);
  const addr = pickAddress(req.body);
  if (addr.isDefault || user.addresses.length === 0) {
    user.addresses.forEach((a) => (a.isDefault = false));
    addr.isDefault = true;
  }
  user.addresses.push(addr);
  await user.save();

  res.status(201).json({ success: true, data: user.addresses });
});

// @desc    Update a saved address (or make it the default)
// @route   PUT /api/v1/auth/addresses/:addressId
// @access  Private
exports.updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const addr = user.addresses.id(req.params.addressId);
  if (!addr) throw new ApiError('Address not found.', 404);
  const updates = pickAddress(req.body);
  if (updates.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  Object.assign(addr, updates);
  await user.save();
  res.status(200).json({ success: true, data: user.addresses });
});

// @desc    Delete a shipping address
// @route   DELETE /api/v1/auth/addresses/:addressId
// @access  Private
exports.deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const removed = user.addresses.find((a) => a._id.toString() === req.params.addressId);
  user.addresses = user.addresses.filter(
    (addr) => addr._id.toString() !== req.params.addressId
  );
  if (removed && removed.isDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();

  res.status(200).json({ success: true, data: user.addresses });
});

// @desc    Get wishlist (populated products)
// @route   GET /api/v1/auth/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: 'wishlist',
    populate: { path: 'category', select: 'name' },
  });
  res.status(200).json({ success: true, data: user.wishlist });
});

// @desc    Toggle product in wishlist
// @route   PUT /api/v1/auth/wishlist/:productId
// @access  Private
exports.toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId }))) {
    throw new ApiError('Product not found.', 404);
  }
  const user = await User.findById(req.user.id);

  const index = user.wishlist.findIndex((id) => id.toString() === productId);

  if (index > -1) {
    user.wishlist.splice(index, 1);
  } else {
    user.wishlist.push(productId);
  }

  await user.save();
  res.status(200).json({ success: true, data: user.wishlist });
});

// @desc    Forgot password — send reset email
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const generic = { success: true, message: 'If an account exists for that email, a reset link has been sent.' };
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = email ? await User.findOne({ email }) : null;

  // Same response whether or not the account exists (no account enumeration).
  if (!user) {
    return res.status(200).json(generic);
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  const html = `
    <p>You requested a password reset for your Charu Pottery account.</p>
    <p>Click the link below to set a new password. This link expires in 10 minutes.</p>
    <a href="${resetUrl}" target="_blank">${resetUrl}</a>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html,
    });
    res.status(200).json(generic);
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    throw new ApiError('Email could not be sent. Please try again later.', 500);
  }
});

// @desc    Reset password using token from email
// @route   PUT /api/v1/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError('Invalid or expired reset token.', 400);
  }

  user.password = req.body.password;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});
