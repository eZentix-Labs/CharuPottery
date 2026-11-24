const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

// Protect routes — verifies JWT and attaches user to req
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new ApiError('Not authorized to access this route. Please log in.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new ApiError('Not authorized, token failed or expired.', 401);
  }
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new ApiError('The user belonging to this token no longer exists.', 401);
  }
  if (!user.isActive) {
    throw new ApiError('This account has been deactivated.', 403);
  }
  req.user = user;
  next();
});

// Restrict route access to specific roles e.g. authorize('admin')
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(
        `Role '${req.user.role}' is not permitted to access this resource.`,
        403
      );
    }
    next();
  };
};

// Optional auth — attaches user if token present, but doesn't block if absent
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      req.user = user && user.isActive ? user : null;
    } catch (error) {
      req.user = null;
    }
  }
  next();
});
