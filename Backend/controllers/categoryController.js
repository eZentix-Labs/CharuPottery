const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

// @desc    Get all categories
// @route   GET /api/v1/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort('displayOrder name');
  res.status(200).json({ success: true, count: categories.length, data: categories });
});

// @desc    Get single category by slug
// @route   GET /api/v1/categories/:slug
// @access  Public
exports.getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug });

  if (!category) {
    throw new ApiError('Category not found.', 404);
  }

  res.status(200).json({ success: true, data: category });
});

// @desc    Create category
// @route   POST /api/v1/categories
// @access  Private/Admin
exports.createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json({ success: true, data: category });
});

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private/Admin
exports.updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!category) {
    throw new ApiError('Category not found.', 404);
  }

  res.status(200).json({ success: true, data: category });
});

// @desc    Delete category (only if no products use it)
// @route   DELETE /api/v1/categories/:id
// @access  Private/Admin
exports.deleteCategory = asyncHandler(async (req, res) => {
  const productCount = await Product.countDocuments({ category: req.params.id });

  if (productCount > 0) {
    throw new ApiError(
      `Cannot delete category — ${productCount} product(s) are still assigned to it.`,
      400
    );
  }

  const category = await Category.findByIdAndDelete(req.params.id);

  if (!category) {
    throw new ApiError('Category not found.', 404);
  }

  res.status(200).json({ success: true, message: 'Category deleted successfully.' });
});
