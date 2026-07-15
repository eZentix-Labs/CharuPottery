const asyncHandler = require('express-async-handler');
const Stripe = require('stripe');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const ApiError = require('../utils/ApiError');
const APIFeatures = require('../utils/apiFeatures');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const SHIPPING_FLAT_RATE = 99;
const TAX_RATE = 0.05; // 5% GST example

// @desc    Create a Stripe PaymentIntent for the current cart
// @route   POST /api/v1/orders/create-payment-intent
// @access  Private
exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });

  if (!cart || cart.items.length === 0) {
    throw new ApiError('Your cart is empty.', 400);
  }

  const itemsPrice = cart.subtotal;
  const taxPrice = Math.round(itemsPrice * TAX_RATE * 100) / 100;
  const shippingPrice = itemsPrice > 2000 ? 0 : SHIPPING_FLAT_RATE;
  const totalPrice =
    itemsPrice + taxPrice + shippingPrice - (cart.discountAmount || 0);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalPrice * 100), // Stripe uses smallest currency unit
    currency: 'inr',
    metadata: { userId: req.user.id.toString() },
  });

  res.status(200).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
    amount: totalPrice,
    breakdown: { itemsPrice, taxPrice, shippingPrice, discountAmount: cart.discountAmount },
  });
});

// @desc    Place a new order (after successful payment, or for COD)
// @route   POST /api/v1/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod, paymentResult } = req.body;

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart || cart.items.length === 0) {
    throw new ApiError('Your cart is empty.', 400);
  }

  // Re-validate stock at order time to prevent overselling
  for (const item of cart.items) {
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) {
      throw new ApiError(`"${item.name}" is no longer available.`, 400);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(
        `Only ${product.stock} unit(s) of "${item.name}" left in stock.`,
        400
      );
    }
  }

  const itemsPrice = cart.subtotal;
  const taxPrice = Math.round(itemsPrice * TAX_RATE * 100) / 100;
  const shippingPrice = itemsPrice > 2000 ? 0 : SHIPPING_FLAT_RATE;
  const discountAmount = cart.discountAmount || 0;
  const totalPrice = itemsPrice + taxPrice + shippingPrice - discountAmount;

  const order = await Order.create({
    user: req.user.id,
    orderItems: cart.items.map((item) => ({
      product: item.product,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
    })),
    shippingAddress,
    paymentMethod,
    paymentResult,
    itemsPrice,
    taxPrice,
    shippingPrice,
    discountAmount,
    totalPrice,
    isPaid: paymentMethod !== 'COD',
    paidAt: paymentMethod !== 'COD' ? Date.now() : undefined,
    statusHistory: [{ status: 'Pending', note: 'Order placed.' }],
  });

  // Decrement stock & increment soldCount
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity, soldCount: item.quantity },
    });
  }

  // Clear cart after successful order
  cart.items = [];
  cart.couponCode = null;
  cart.discountAmount = 0;
  await cart.save();

  res.status(201).json({ success: true, data: order });
});

// @desc    Get logged-in user's orders
// @route   GET /api/v1/orders/my-orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort('-createdAt');
  res.status(200).json({ success: true, count: orders.length, data: orders });
});

// @desc    Get single order (owner or admin only)
// @route   GET /api/v1/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');

  if (!order) {
    throw new ApiError('Order not found.', 404);
  }

  if (
    order.user._id.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    throw new ApiError('Not authorized to view this order.', 403);
  }

  res.status(200).json({ success: true, data: order });
});

// @desc    Cancel an order (only if still Pending/Processing)
// @route   PUT /api/v1/orders/:id/cancel
// @access  Private
exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new ApiError('Order not found.', 404);
  }
  if (order.user.toString() !== req.user.id) {
    throw new ApiError('Not authorized to cancel this order.', 403);
  }
  if (!['Pending', 'Processing'].includes(order.orderStatus)) {
    throw new ApiError(`Cannot cancel an order that is already ${order.orderStatus}.`, 400);
  }

  order.orderStatus = 'Cancelled';
  order.cancelReason = req.body.reason || 'Cancelled by customer';
  order.cancelledAt = Date.now();
  order.statusHistory.push({ status: 'Cancelled', note: order.cancelReason });
  await order.save();

  // Restock items
  for (const item of order.orderItems) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity, soldCount: -item.quantity },
    });
  }

  res.status(200).json({ success: true, data: order });
});

// ─── ADMIN ENDPOINTS ──────────────────────────────────────────────

// @desc    Get all orders (admin)
// @route   GET /api/v1/orders
// @access  Private/Admin
exports.getAllOrders = asyncHandler(async (req, res) => {
  const baseQuery = Order.find().populate('user', 'name email');
  const features = new APIFeatures(baseQuery, req.query).filter().sort().paginate();

  const orders = await features.query;
  const total = await Order.countDocuments();

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page: features.pagination.page,
    pages: Math.ceil(total / features.pagination.limit),
    data: orders,
  });
});

// @desc    Update order status / tracking info (admin)
// @route   PUT /api/v1/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderStatus, trackingNumber, carrier, note } = req.body;

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new ApiError('Order not found.', 404);
  }

  if (orderStatus) {
    order.orderStatus = orderStatus;
    order.statusHistory.push({ status: orderStatus, note });

    if (orderStatus === 'Delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }
  }

  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (carrier) order.carrier = carrier;

  await order.save();

  res.status(200).json({ success: true, data: order });
});

// @desc    Sales analytics summary (admin dashboard)
// @route   GET /api/v1/orders/analytics/summary
// @access  Private/Admin
exports.getSalesAnalytics = asyncHandler(async (req, res) => {
  const summary = await Order.aggregate([
    { $match: { isPaid: true } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalPrice' },
        totalOrders: { $sum: 1 },
        avgOrderValue: { $avg: '$totalPrice' },
      },
    },
  ]);

  const statusCounts = await Order.aggregate([
    { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...(summary[0] || { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 }),
      statusCounts,
    },
  });
});
