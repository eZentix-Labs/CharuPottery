const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// Centralised error handler. Responses never include stack traces outside
// development, and logs carry only the route and error class/message.
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err instanceof ApiError ? err : null;

  if (!error) {
    if (err.name === 'CastError') error = new ApiError('Resource not found.', 404);
    else if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'value';
      error = new ApiError(`Duplicate value entered for '${field}'. Please use another value.`, 400);
    } else if (err.name === 'ValidationError') {
      error = new ApiError(Object.values(err.errors).map((v) => v.message).join(', '), 400);
    } else if (err.name === 'JsonWebTokenError') error = new ApiError('Invalid token. Please log in again.', 401);
    else if (err.name === 'TokenExpiredError') error = new ApiError('Your session has expired. Please log in again.', 401);
    else if (err.name === 'MulterError') {
      error = new ApiError(err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Invalid file upload.', 400);
    } else if (err.type === 'entity.too.large') error = new ApiError('Request is too large.', 413);
    else if (err.type === 'entity.parse.failed') error = new ApiError('Malformed JSON body.', 400);
    else if (err.statusCode && err.statusCode < 500 && err.isOperational) error = new ApiError(err.message, err.statusCode);
  }

  const status = error ? error.statusCode : 500;
  if (status >= 500) {
    logger.error('request.error', { method: req.method, path: req.originalUrl.split('?')[0], name: err.name, msg: err.message });
  }
  const message = error ? error.message : 'Something went wrong. Please try again.';
  res.status(status).json({
    success: false,
    error: message,
    message,
    ...(error?.code && { code: error.code }),
    ...(error?.details !== undefined && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

const notFound = (req, res, next) => {
  next(new ApiError(`Route not found: ${req.originalUrl.split('?')[0]}`, 404));
};

module.exports = { errorHandler, notFound };
