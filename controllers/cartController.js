const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

// @desc    Get current user's cart
// @route   GET /api/v1/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    cart = await Cart.create({ user: req.user.id, items: [] });
  }

  res.status(200).json({ success: true, data: cart });
});

// @desc    Add item to cart (or increase quantity if already present)
// @route   POST /api/v1/cart
// @access  Private
exports.addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError('Product not found.', 404);
  }

  if (product.stock < quantity) {
    throw new ApiError(
      `Only ${product.stock} unit(s) of "${product.name}" left in stock.`,
      400
    );
  }

  let cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    cart = await Cart.create({ user: req.user.id, items: [] });
  }

  const existingItem = cart.items.find(
    (item) => item.product.toString() === productId
  );

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    if (newQuantity > product.stock) {
      throw new ApiError(`Cannot add more — only ${product.stock} in stock.`, 400);
    }
    existingItem.quantity = newQuantity;
  } else {
    cart.items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0]?.url || '',
      price: product.finalPrice,
      quantity,
    });
  }

  await cart.save();
  res.status(200).json({ success: true, data: cart });
});

// @desc    Update quantity of a cart item
// @route   PUT /api/v1/cart/:productId
// @access  Private
exports.updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { productId } = req.params;

  if (!quantity || quantity < 1) {
    throw new ApiError('Quantity must be at least 1.', 400);
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError('Product not found.', 404);
  }
  if (quantity > product.stock) {
    throw new ApiError(`Only ${product.stock} unit(s) available.`, 400);
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    throw new ApiError('Cart not found.', 404);
  }

  const item = cart.items.find((i) => i.product.toString() === productId);
  if (!item) {
    throw new ApiError('Item not found in cart.', 404);
  }

  item.quantity = quantity;
  await cart.save();

  res.status(200).json({ success: true, data: cart });
});

// @desc    Remove item from cart
// @route   DELETE /api/v1/cart/:productId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    throw new ApiError('Cart not found.', 404);
  }

  cart.items = cart.items.filter(
    (item) => item.product.toString() !== req.params.productId
  );

  await cart.save();
  res.status(200).json({ success: true, data: cart });
});

// @desc    Clear entire cart
// @route   DELETE /api/v1/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });

  if (cart) {
    cart.items = [];
    cart.couponCode = null;
    cart.discountAmount = 0;
    await cart.save();
  }

  res.status(200).json({ success: true, data: cart });
});
