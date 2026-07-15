const ApiError = require('../utils/ApiError');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  console.error(`🔥 Error: ${err.message}`.red || `Error: ${err.message}`);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = new ApiError(`Resource not found with id of ${err.value}`, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new ApiError(
      `Duplicate value entered for '${field}'. Please use another value.`,
      400
    );
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    error = new ApiError(messages.join(', '), 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new ApiError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new ApiError('Your session has expired. Please log in again.', 401);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Handle unmatched routes
const notFound = (req, res, next) => {
  const error = new ApiError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
};

module.exports = { errorHandler, notFound };
