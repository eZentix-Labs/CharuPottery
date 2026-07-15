const { body, validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Runs after a validation chain — throws ApiError with all messages if invalid
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map((err) => err.msg).join(', ');
    throw new ApiError(message, 400);
  }
  next();
};

exports.registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

exports.loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
];

exports.reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').trim().notEmpty().withMessage('Comment is required'),
];

exports.orderValidation = [
  body('shippingAddress').notEmpty().withMessage('Shipping address is required'),
  body('paymentMethod')
    .isIn(['Card', 'Stripe', 'COD', 'UPI'])
    .withMessage('Invalid payment method'),
];
