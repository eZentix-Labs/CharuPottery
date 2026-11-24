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

const passwordRule = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number');

exports.passwordRule = passwordRule;

exports.registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 50 }).withMessage('Name is too long'),
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail({ gmail_remove_dots: false }),
  passwordRule('password'),
  body('phone').optional({ values: 'falsy' }).matches(/^(\+91)?[6-9][0-9]{9}$/).withMessage('Enter a valid 10-digit mobile number'),
];

exports.addressValidation = [
  body('label').optional().isString().isLength({ max: 20 }),
  body('street').trim().isLength({ min: 5, max: 200 }).withMessage('Street address is required'),
  body('city').trim().isLength({ min: 2, max: 60 }).withMessage('City is required'),
  body('state').trim().isLength({ min: 2, max: 60 }).withMessage('State is required'),
  body('postalCode').trim().matches(/^[1-9][0-9]{5}$/).withMessage('Enter a valid 6-digit PIN code'),
  body('country').optional().isString().isLength({ max: 56 }),
  body('phone').trim().matches(/^(\+91)?[6-9][0-9]{9}$/).withMessage('Enter a valid 10-digit mobile number'),
  body('isDefault').optional().isBoolean(),
];

exports.loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail({ gmail_remove_dots: false }),
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
  body('rating').toInt().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').optional().isString().isLength({ max: 100 }).withMessage('Title is too long'),
  body('comment').trim().isLength({ min: 3, max: 1000 }).withMessage('Comment must be 3–1000 characters'),
];
