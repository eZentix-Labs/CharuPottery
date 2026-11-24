const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const InventoryItem = require('../models/InventoryItem');
const InventoryMovement = require('../models/InventoryMovement');
const Notification = require('../models/Notification');
const MessageCampaign = require('../models/MessageCampaign');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/pagination');
const { withTransaction } = require('../utils/withTransaction');
const inventory = require('../services/inventory');
const loyalty = require('../services/loyalty');
const whatsapp = require('../services/messaging/whatsapp');
const { audit } = require('../services/audit');

const oid = (id, what = 'Item') => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(`${what} not found.`, 404);
  return id;
};
const amountExpr = { $ifNull: ['$pricing.totalPaise', { $round: [{ $multiply: ['$totalPrice', 100] }, 0] }] };

// ─── dashboard ────────────────────────────────────────────────────────────

// @route GET /api/v1/admin/dashboard
exports.getDashboard = asyncHandler(async (req, res) => {
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [
    revenue30, statusCounts, codAwaiting, lowStockProducts, lowStockMaterials, recentOrders, recentActivity, topProducts,
    byState, customers, repeatCustomers, needsReview, pendingReviews,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { 'payment.status': 'PAID', 'payment.paidAt': { $gte: since30 } } },
      { $group: { _id: null, paise: { $sum: amountExpr }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { 'payment.provider': 'COD', 'payment.status': 'PAYMENT_PENDING', orderStatus: { $in: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'] } } },
      { $group: { _id: null, paise: { $sum: amountExpr }, count: { $sum: 1 } } },
    ]),
    Product.find({ isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).select('name stock lowStockThreshold reservedStock').sort('stock').limit(20),
    InventoryItem.find({ isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).select('name category stock lowStockThreshold unit').sort('stock').limit(20),
    Order.find().sort('-createdAt').limit(8).populate('user', 'name').select('orderNumber orderStatus payment.status payment.provider pricing.totalPaise totalPrice createdAt user'),
    AuditLog.find().sort('-createdAt').limit(10).populate('actor', 'name').select('action entity entityId createdAt actor'),
    Product.find({ isActive: true }).sort('-soldCount').limit(5).select('name soldCount stock'),
    Order.aggregate([
      { $match: { orderStatus: { $nin: ['Cancelled', 'Expired', 'AwaitingPayment'] } } },
      { $group: { _id: '$shippingAddress.state', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    User.countDocuments({ role: 'user' }),
    Order.aggregate([
      { $match: { 'payment.status': 'PAID' } },
      { $group: { _id: '$user', n: { $sum: 1 } } },
      { $match: { n: { $gte: 2 } } },
      { $count: 'repeat' },
    ]),
    Order.countDocuments({ 'payment.needsReview': true }),
    mongoose.model('Review').countDocuments({ status: 'pending' }),
  ]);
  const count = (s) => statusCounts.find((x) => x._id === s)?.count || 0;
  res.status(200).json({
    success: true,
    data: {
      revenueLast30DaysPaise: revenue30[0]?.paise || 0,
      paidOrdersLast30Days: revenue30[0]?.count || 0,
      codAwaitingCollection: { count: codAwaiting[0]?.count || 0, paise: codAwaiting[0]?.paise || 0 },
      pendingFulfilment: count('Pending') + count('Processing'),
      statusCounts,
      lowStockProducts,
      lowStockMaterials,
      recentOrders,
      recentActivity,
      topProducts,
      ordersByState: byState,
      customers,
      repeatCustomers: repeatCustomers[0]?.repeat || 0,
      paymentsNeedingReview: needsReview,
      reviewsPendingModeration: pendingReviews,
      notes: ['Revenue counts only verified payments (provider-confirmed online payments and COD cash recorded as collected).'],
    },
  });
});

// ─── customers ────────────────────────────────────────────────────────────

// @route GET /api/v1/admin/customers?q=&page=
exports.listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 20, max: 100 });
  const filter = { role: 'user' };
  if (req.query.q && typeof req.query.q === 'string') {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.whatsappOptIn === 'true') filter['marketingConsent.whatsapp.optedIn'] = true;
  const [users, total] = await Promise.all([
    User.find(filter).select('name email phone isActive createdAt marketingConsent.whatsapp.optedIn').sort('-createdAt').skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const stats = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    {
      $group: {
        _id: '$user',
        orders: { $sum: 1 },
        paidPaise: { $sum: { $cond: [{ $eq: ['$payment.status', 'PAID'] }, amountExpr, 0] } },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));
  const data = users.map((u) => ({ ...u, orders: byUser.get(String(u._id))?.orders || 0, paidPaise: byUser.get(String(u._id))?.paidPaise || 0, lastOrderAt: byUser.get(String(u._id))?.lastOrderAt }));
  res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), data });
});

// @route GET /api/v1/admin/customers/:id
exports.getCustomer = asyncHandler(async (req, res) => {
  oid(req.params.id, 'Customer');
  const user = await User.findById(req.params.id).select('-wishlist').lean();
  if (!user) throw new ApiError('Customer not found.', 404);
  const [orders, prime] = await Promise.all([
    Order.find({ user: user._id }).sort('-createdAt').limit(100).select('orderNumber orderStatus payment.status payment.provider pricing totalPrice createdAt'),
    loyalty.getStatus(user._id),
  ]);
  const paidPaise = orders.filter((o) => o.payment?.status === 'PAID').reduce((s, o) => s + (o.pricing?.totalPaise ?? Math.round(o.totalPrice * 100)), 0);
  await audit({ actor: req.user, action: 'customer.view', entity: 'User', entityId: user._id, req });
  res.status(200).json({ success: true, data: { customer: user, orders, totals: { orders: orders.length, paidPaise }, prime } });
});

// @route PATCH /api/v1/admin/customers/:id/status  { isActive }
exports.setCustomerStatus = asyncHandler(async (req, res) => {
  oid(req.params.id, 'Customer');
  if (typeof req.body.isActive !== 'boolean') throw new ApiError('isActive must be true or false.', 400);
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'user' },
    { $set: { isActive: req.body.isActive }, $inc: { tokenVersion: 1 } },
    { new: true }
  ).select('name email isActive');
  if (!user) throw new ApiError('Customer not found.', 404);
  await audit({ actor: req.user, action: req.body.isActive ? 'customer.activate' : 'customer.deactivate', entity: 'User', entityId: user._id, req });
  res.status(200).json({ success: true, data: user });
});

// ─── inventory: packaging & additional stock sections ─────────────────────

const ITEM_FIELDS = ['name', 'category', 'unit', 'sku', 'supplier', 'lowStockThreshold', 'notes', 'isActive'];
const pickItem = (b) => {
  const o = {};
  for (const k of ITEM_FIELDS) if (b[k] !== undefined) o[k] = b[k];
  if (o.sku === '') o.sku = undefined;
  return o;
};

// @route GET /api/v1/admin/inventory/items?category=&q=&lowStock=
exports.listInventoryItems = asyncHandler(async (req, res) => {
  const filter = {};
  if (typeof req.query.category === 'string' && req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
  if (req.query.q && typeof req.query.q === 'string') filter.name = new RegExp(escapeRegex(req.query.q.slice(0, 60)), 'i');
  if (req.query.includeInactive !== 'true') filter.isActive = true;
  const [items, categories] = await Promise.all([
    InventoryItem.find(filter).sort('category name').limit(500),
    InventoryItem.distinct('category'),
  ]);
  res.status(200).json({ success: true, data: items, categories });
});

// @route POST /api/v1/admin/inventory/items  { ..., stock }
exports.createInventoryItem = asyncHandler(async (req, res) => {
  const stock = parseInt(req.body.stock, 10) || 0;
  if (stock < 0) throw new ApiError('Stock cannot be negative.', 400);
  const item = await withTransaction(async (session) => {
    const [it] = await InventoryItem.create([{ ...pickItem(req.body), stock, createdBy: req.user._id }], { session });
    await inventory.recordInitial({ session, itemModel: 'InventoryItem', item: it, actor: req.user });
    await audit({ session, actor: req.user, action: 'inventory_item.create', entity: 'InventoryItem', entityId: it._id, after: { name: it.name, stock }, req });
    return it;
  });
  res.status(201).json({ success: true, data: item });
});

// @route PUT /api/v1/admin/inventory/items/:id  (details only — stock changes use adjustments)
exports.updateInventoryItem = asyncHandler(async (req, res) => {
  oid(req.params.id);
  const item = await InventoryItem.findByIdAndUpdate(req.params.id, { $set: pickItem(req.body) }, { new: true, runValidators: true });
  if (!item) throw new ApiError('Item not found.', 404);
  await audit({ actor: req.user, action: 'inventory_item.update', entity: 'InventoryItem', entityId: item._id, req });
  res.status(200).json({ success: true, data: item });
});

// @route POST /api/v1/admin/inventory/items/:id/adjust  { delta, reason }
exports.adjustInventoryItem = asyncHandler(async (req, res) => {
  oid(req.params.id);
  const item = await withTransaction(async (session) => {
    const it = await inventory.adjustStock({ session, itemModel: 'InventoryItem', itemId: req.params.id, delta: req.body.delta, actor: req.user, reason: req.body.reason });
    await audit({ session, actor: req.user, action: 'stock.adjust', entity: 'InventoryItem', entityId: it._id, meta: { delta: Number(req.body.delta), reason: req.body.reason }, req });
    return it;
  });
  res.status(200).json({ success: true, data: item });
});

// @route GET /api/v1/admin/inventory/movements?itemModel=&item=&type=
exports.listMovements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 50, max: 200 });
  const filter = {};
  if (['Product', 'InventoryItem'].includes(req.query.itemModel)) filter.itemModel = req.query.itemModel;
  if (req.query.item && mongoose.isValidObjectId(req.query.item)) filter.item = req.query.item;
  if (InventoryMovement.MOVEMENT_TYPES.includes(req.query.type)) filter.type = req.query.type;
  const [rows, total] = await Promise.all([
    InventoryMovement.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('item', 'name').populate('actor', 'name').populate('order', 'orderNumber'),
    InventoryMovement.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), data: rows });
});

// ─── coupons ──────────────────────────────────────────────────────────────

const COUPON_FIELDS = ['code', 'description', 'type', 'value', 'maxDiscountPaise', 'minOrderPaise', 'startsAt', 'endsAt', 'usageLimit', 'perUserLimit', 'isActive', 'isPublic'];
const pickCoupon = (b) => {
  const o = {};
  for (const k of COUPON_FIELDS) if (b[k] !== undefined && b[k] !== '') o[k] = b[k];
  for (const k of ['startsAt', 'endsAt', 'usageLimit', 'maxDiscountPaise']) if (b[k] === '' || b[k] === null) o[k] = null;
  return o;
};

exports.listCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt').limit(200);
  res.status(200).json({ success: true, data: coupons });
});

exports.createCoupon = asyncHandler(async (req, res) => {
  const c = await Coupon.create({ ...pickCoupon(req.body), usedCount: 0, createdBy: req.user._id });
  await audit({ actor: req.user, action: 'coupon.create', entity: 'Coupon', entityId: c._id, after: { code: c.code, type: c.type, value: c.value }, req });
  res.status(201).json({ success: true, data: c });
});

exports.updateCoupon = asyncHandler(async (req, res) => {
  oid(req.params.id, 'Coupon');
  const c = await Coupon.findById(req.params.id);
  if (!c) throw new ApiError('Coupon not found.', 404);
  const fields = pickCoupon(req.body);
  delete fields.code; // codes are immutable once created (redemptions reference them)
  Object.assign(c, fields);
  await c.save();
  await audit({ actor: req.user, action: 'coupon.update', entity: 'Coupon', entityId: c._id, after: fields, req });
  res.status(200).json({ success: true, data: c });
});

exports.getCouponRedemptions = asyncHandler(async (req, res) => {
  oid(req.params.id, 'Coupon');
  const rows = await CouponRedemption.find({ coupon: req.params.id }).sort('-createdAt').limit(200).populate('user', 'name email').populate('order', 'orderNumber orderStatus');
  res.status(200).json({ success: true, data: rows });
});

// ─── site notifications & campaigns ───────────────────────────────────────

exports.listNotifications = asyncHandler(async (req, res) => {
  const rows = await Notification.find({ audience: 'all' }).sort('-createdAt').limit(100).select('-readBy');
  res.status(200).json({ success: true, data: rows });
});

exports.createNotification = asyncHandler(async (req, res) => {
  const { title, body, link, type, activeFrom, activeUntil } = req.body;
  if (!title || String(title).trim().length < 3) throw new ApiError('Title is required.', 400);
  if (link && !/^(\/(?!\/)|https:\/\/)/.test(String(link))) throw new ApiError('Link must start with / or https://', 400);
  const n = await Notification.create({
    audience: 'all',
    type: ['offer', 'coupon', 'launch', 'update'].includes(type) ? type : 'update',
    title: String(title).trim().slice(0, 120),
    body: body ? String(body).slice(0, 600) : undefined,
    link: link || undefined,
    activeFrom: activeFrom ? new Date(activeFrom) : undefined,
    activeUntil: activeUntil ? new Date(activeUntil) : undefined,
    createdBy: req.user._id,
  });
  await audit({ actor: req.user, action: 'notification.broadcast', entity: 'Notification', entityId: n._id, req });
  res.status(201).json({ success: true, data: n });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndDelete({ _id: req.params.id, audience: 'all' });
  if (!n) throw new ApiError('Notification not found.', 404);
  await audit({ actor: req.user, action: 'notification.delete', entity: 'Notification', entityId: n._id, req });
  res.status(200).json({ success: true });
});

// @route GET /api/v1/admin/campaigns/whatsapp/status
exports.whatsappStatus = asyncHandler(async (req, res) => {
  const st = whatsapp.providerStatus();
  const optedIn = await User.countDocuments({ role: 'user', isActive: true, 'marketingConsent.whatsapp.optedIn': true, phone: { $nin: ['', null] } });
  res.status(200).json({ success: true, data: { ...st, optedInCustomers: optedIn } });
});

// @route POST /api/v1/admin/campaigns/whatsapp  { templateName, templateParams[] }
// Records the campaign and evaluates consent per recipient. With no provider
// configured every eligible recipient is recorded as BLOCKED — nothing is sent.
exports.createWhatsappCampaign = asyncHandler(async (req, res) => {
  const templateName = String(req.body.templateName || '').trim();
  if (!/^[a-z0-9_]{3,100}$/.test(templateName)) throw new ApiError('templateName must be an approved WhatsApp template name (lowercase, digits, _).', 400);
  const params = Array.isArray(req.body.templateParams) ? req.body.templateParams.slice(0, 10).map((p) => String(p).slice(0, 200)) : [];
  const users = await User.find({ role: 'user', isActive: true }).select('phone marketingConsent').limit(5000);
  const results = [];
  let eligible = 0;
  let suppressed = 0;
  for (const u of users) {
    const r = await whatsapp.send(u, templateName, params);
    if (r.outcome === 'SKIPPED_NO_CONSENT') { suppressed += 1; continue; }
    eligible += 1;
    results.push({ user: u._id, outcome: r.outcome, at: new Date() });
  }
  const st = whatsapp.providerStatus();
  const campaign = await MessageCampaign.create({
    channel: 'whatsapp', templateName, templateParams: params,
    status: st.enabled ? 'SENT' : 'BLOCKED', statusReason: st.enabled ? undefined : st.reason,
    eligibleCount: eligible, suppressedCount: suppressed, results, createdBy: req.user._id,
  });
  await audit({ actor: req.user, action: 'campaign.whatsapp', entity: 'MessageCampaign', entityId: campaign._id, meta: { status: campaign.status, eligible, suppressed }, req });
  res.status(201).json({ success: true, data: { _id: campaign._id, status: campaign.status, statusReason: campaign.statusReason, eligibleCount: eligible, suppressedCount: suppressed } });
});

exports.listCampaigns = asyncHandler(async (req, res) => {
  const rows = await MessageCampaign.find().select('-results').sort('-createdAt').limit(50);
  res.status(200).json({ success: true, data: rows });
});

// ─── audit log ────────────────────────────────────────────────────────────

exports.listAudit = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 50, max: 200 });
  const filter = {};
  if (typeof req.query.action === 'string' && /^[a-z_.]+$/.test(req.query.action)) filter.action = req.query.action;
  if (typeof req.query.entity === 'string' && /^[A-Za-z]+$/.test(req.query.entity)) filter.entity = req.query.entity;
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('actor', 'name'),
    AuditLog.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), data: rows });
});
