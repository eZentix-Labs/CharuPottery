const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Get all products — supports filtering, search, sort, pagination
//          /api/v1/products?category=...&clayType=Stoneware&price[gte]=500&keyword=vase&sort=-price&page=2&limit=12
// @route   GET /api/v1/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res) => {
  const baseQuery = Product.find({ isActive: true }).populate(
    'category',
    'name slug'
  );

  const features = new APIFeatures(baseQuery, req.query)
    .filter()
    .search()
    .sort()
    .limitFields()
    .paginate();

  const products = await features.query;

  // Total count for pagination metadata (re-runs filter/search without pagination)
  const countFeatures = new APIFeatures(
    Product.find({ isActive: true }),
    req.query
  )
    .filter()
    .search();
  const total = await countFeatures.query.countDocuments();

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    page: features.pagination.page,
    pages: Math.ceil(total / features.pagination.limit),
    data: products,
  });
});

// @desc    Get single product by slug or id
// @route   GET /api/v1/products/:idOrSlug
// @access  Public
exports.getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isObjectId = idOrSlug.match(/^[0-9a-fA-F]{24}$/);

  const query = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };

  const product = await Product.findOne(query).populate('category', 'name slug');

  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  product.viewCount += 1;
  await product.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, data: product });
});

// @desc    Create new product
// @route   POST /api/v1/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user.id;
  const product = await Product.create(req.body);

  res.status(201).json({ success: true, data: product });
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, data: product });
});

// @desc    Delete product (soft delete — deactivate)
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  product.isActive = false;
  await product.save();

  res.status(200).json({ success: true, message: 'Product deactivated successfully.' });
});

// @desc    Permanently delete product
// @route   DELETE /api/v1/products/:id/permanent
// @access  Private/Admin
exports.permanentlyDeleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);

  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  res.status(200).json({ success: true, message: 'Product permanently deleted.' });
});

// @desc    Get featured products
// @route   GET /api/v1/products/featured
// @access  Public
exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isFeatured: true, isActive: true })
    .populate('category', 'name slug')
    .limit(8);

  res.status(200).json({ success: true, count: products.length, data: products });
});

// @desc    Get related products (same category)
// @route   GET /api/v1/products/:id/related
// @access  Public
exports.getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  const related = await Product.find({
    category: product.category,
    _id: { $ne: product._id },
    isActive: true,
  }).limit(6);

  res.status(200).json({ success: true, data: related });
});

// @desc    Update stock quantity (e.g., after a manual inventory check)
// @route   PATCH /api/v1/products/:id/stock
// @access  Private/Admin
exports.updateStock = asyncHandler(async (req, res) => {
  const { stock } = req.body;

  if (stock === undefined || stock < 0) {
    throw new ApiError('Please provide a valid stock quantity.', 400);
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { stock },
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new ApiError('Product not found.', 404);
  }

  res.status(200).json({ success: true, data: product });
});
