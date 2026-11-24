const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const commerce = require('../config/commerce');

/**
 * The cart stores a display snapshot (name, image, price). Whenever the cart
 * is read, the snapshot is refreshed from the current product so customers
 * see price changes before checkout; checkout itself always reprices on the
 * server and never uses these snapshot prices.
 */
async function refreshCart(cart) {
  if (!cart || !cart.items.length) return { cart, changes: [] };
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const changes = [];
  let dirty = false;
  for (const item of cart.items) {
    const p = byId.get(String(item.product));
    if (!p || !p.isActive) {
      changes.push({ productId: String(item.product), name: item.name, type: 'UNAVAILABLE' });
      continue;
    }
    if (item.price !== p.finalPrice) {
      changes.push({ productId: String(p._id), name: p.name, type: 'PRICE_CHANGED', oldPrice: item.price, newPrice: p.finalPrice });
      item.price = p.finalPrice;
      dirty = true;
    }
    if (item.quantity > p.stock) changes.push({ productId: String(p._id), name: p.name, type: 'LOW_STOCK', available: p.stock });
    const img = p.images?.[0]?.url || '';
    if (item.name !== p.name || item.image !== img) {
      item.name = p.name;
      item.image = img;
      dirty = true;
    }
  }
  if (dirty) await cart.save();
  return { cart, changes };
}

function parseQty(q) {
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1 || n > commerce.maxQuantityPerLine) {
    throw new ApiError(`Quantity must be a whole number between 1 and ${commerce.maxQuantityPerLine}.`, 400);
  }
  return n;
}

async function loadCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

// @route GET /api/v1/cart
exports.getCart = asyncHandler(async (req, res) => {
  const { cart, changes } = await refreshCart(await loadCart(req.user._id));
  res.status(200).json({ success: true, data: cart, changes });
});

// @route POST /api/v1/cart  { productId, quantity }
exports.addToCart = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const quantity = parseQty(req.body.quantity ?? 1);
  if (!mongoose.isValidObjectId(productId)) throw new ApiError('Product not found.', 404);
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw new ApiError('Product not found.', 404);

  const cart = await loadCart(req.user._id);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > product.stock) throw new ApiError(`Only ${product.stock} unit(s) of "${product.name}" available.`, 400);
  if (newQty > commerce.maxQuantityPerLine) throw new ApiError(`You can order at most ${commerce.maxQuantityPerLine} of one item.`, 400);
  if (!existing && cart.items.length >= commerce.maxLinesPerOrder) throw new ApiError('Your cart is full.', 400);

  if (existing) existing.quantity = newQty;
  else cart.items.push({ product: product._id, name: product.name, image: product.images?.[0]?.url || '', price: product.finalPrice, quantity });
  await cart.save();
  const { changes } = await refreshCart(cart);
  res.status(200).json({ success: true, data: cart, changes });
});

// @route PUT /api/v1/cart/:productId  { quantity }
exports.updateCartItem = asyncHandler(async (req, res) => {
  const quantity = parseQty(req.body.quantity);
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) throw new ApiError('Product not found.', 404);
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw new ApiError('Product not found.', 404);
  if (quantity > product.stock) throw new ApiError(`Only ${product.stock} unit(s) available.`, 400);

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw new ApiError('Cart not found.', 404);
  const item = cart.items.find((i) => String(i.product) === productId);
  if (!item) throw new ApiError('Item not found in cart.', 404);
  item.quantity = quantity;
  await cart.save();
  const { changes } = await refreshCart(cart);
  res.status(200).json({ success: true, data: cart, changes });
});

// @route DELETE /api/v1/cart/:productId
exports.removeFromCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw new ApiError('Cart not found.', 404);
  cart.items = cart.items.filter((i) => String(i.product) !== req.params.productId);
  await cart.save();
  res.status(200).json({ success: true, data: cart });
});

// @route DELETE /api/v1/cart
exports.clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) {
    cart.items = [];
    cart.couponCode = null;
    cart.discountAmount = 0;
    await cart.save();
  }
  res.status(200).json({ success: true, data: cart });
});
