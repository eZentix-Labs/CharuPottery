const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const InventoryMovement = require('../models/InventoryMovement');
const ApiError = require('../utils/ApiError');
const { paginate, escapeRegex } = require('../utils/pagination');
const { withTransaction } = require('../utils/withTransaction');
const inventory = require('../services/inventory');
const { audit } = require('../services/audit');

// Fields an admin may set through create/update. Stock, reservations, sold
// counts, ratings and slugs are managed by the server.
const EDITABLE = [
  'name', 'description', 'shortDescription', 'price', 'discountPrice', 'category', 'tags', 'clayType', 'glazeType',
  'firingTechnique', 'technique', 'color', 'dimensions', 'careInstructions', 'isMicrowaveSafe', 'isDishwasherSafe',
  'isFoodSafe', 'isHandmade', 'artisan', 'madeToOrder', 'processingTime', 'images', 'sku', 'lowStockThreshold',
  'isFeatured', 'isActive', 'isNewArrival',
];

function pick(body) {
  const out = {};
  for (const k of EDITABLE) if (body[k] !== undefined) out[k] = body[k];
  if (typeof out.tags === 'string') out.tags = out.tags.split(',').map((s) => s.trim()).filter(Boolean);
  if (typeof out.color === 'string') out.color = out.color.split(',').map((s) => s.trim()).filter(Boolean);
  if (out.discountPrice === '' || out.discountPrice === null) out.discountPrice = undefined;
  return out;
}

const SORTS = {
  newest: '-createdAt', '-createdAt': '-createdAt', price: 'price', '-price': '-price',
  popular: '-soldCount', '-soldCount': '-soldCount', rating: '-ratingsAverage', '-ratingsAverage': '-ratingsAverage', name: 'name',
};

async function buildPublicFilter(q) {
  const filter = { isActive: true };
  if (q.category && typeof q.category === 'string') {
    if (mongoose.isValidObjectId(q.category)) filter.category = q.category;
    else {
      const cat = await Category.findOne({ slug: q.category }).select('_id');
      filter.category = cat ? cat._id : null;
    }
  }
  if (typeof q.clayType === 'string') filter.clayType = q.clayType;
  if (typeof q.technique === 'string') filter.technique = q.technique;
  if (q.isFeatured === 'true') filter.isFeatured = true;
  if (q.isNewArrival === 'true') filter.isNewArrival = true;
  if (q.inStock === 'true') filter.stock = { $gt: 0 };
  const price = {};
  const p = q.price && typeof q.price === 'object' ? q.price : {};
  const gte = Number(p.gte ?? q.minPrice);
  const lte = Number(p.lte ?? q.maxPrice);
  if (Number.isFinite(gte)) price.$gte = gte;
  if (Number.isFinite(lte)) price.$lte = lte;
  if (Object.keys(price).length) filter.price = price;
  if (q.keyword && typeof q.keyword === 'string' && q.keyword.trim()) filter.$text = { $search: q.keyword.trim().slice(0, 100) };
  return filter;
}

// @route GET /api/v1/products  (public) — whitelisted filters, capped page size
exports.getProducts = asyncHandler(async (req, res) => {
  const filter = await buildPublicFilter(req.query);
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 12, max: 48 });
  const sort = SORTS[req.query.sort] || '-createdAt';
  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').select('-__v -createdBy').sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: products.length, total, page, pages: Math.ceil(total / limit), data: products });
});

// @route GET /api/v1/products/admin/all  (admin) — includes archived products
exports.getAdminProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 20, max: 100 });
  const filter = {};
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'archived') filter.isActive = false;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
  if (req.query.category && mongoose.isValidObjectId(req.query.category)) filter.category = req.query.category;
  if (req.query.q && typeof req.query.q === 'string') {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name').sort('-createdAt').skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: products.length, total, page, pages: Math.ceil(total / limit), data: products });
});

// @route GET /api/v1/products/:idOrSlug  (public; archived products only for admins)
exports.getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: String(idOrSlug) };
  const product = await Product.findOne(query).populate('category', 'name slug');
  if (!product || (!product.isActive && req.user?.role !== 'admin')) throw new ApiError('Product not found.', 404);
  Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  res.status(200).json({ success: true, data: product });
});

// @route POST /api/v1/products  (admin) — initial stock is recorded in the ledger
exports.createProduct = asyncHandler(async (req, res) => {
  const fields = pick(req.body);
  const stock = parseInt(req.body.stock, 10) || 0;
  if (stock < 0) throw new ApiError('Stock cannot be negative.', 400);
  const product = await withTransaction(async (session) => {
    const [p] = await Product.create([{ ...fields, stock, reservedStock: 0, createdBy: req.user._id }], { session });
    await inventory.recordInitial({ session, item: p, actor: req.user });
    await audit({ session, actor: req.user, action: 'product.create', entity: 'Product', entityId: p._id, after: { name: p.name, price: p.price, stock }, req });
    return p;
  });
  res.status(201).json({ success: true, data: product });
});

// @route PUT /api/v1/products/:id  (admin)
// A changed `stock` must come with `expectedStock` (the value the admin saw)
// and is applied as a ledgered compare-and-set.
exports.updateProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError('Product not found.', 404);
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError('Product not found.', 404);
  const fields = pick(req.body);
  const before = { name: product.name, price: product.price, discountPrice: product.discountPrice, isActive: product.isActive, stock: product.stock };

  const result = await withTransaction(async (session) => {
    const doc = await Product.findById(req.params.id).session(session);
    Object.assign(doc, fields);
    if (fields.discountPrice === undefined && req.body.discountPrice !== undefined) doc.discountPrice = undefined;
    await doc.save({ session });
    if (req.body.stock !== undefined && req.body.stock !== '' && Number(req.body.stock) !== doc.stock) {
      const expected = req.body.expectedStock !== undefined ? Number(req.body.expectedStock) : before.stock;
      await inventory.setStock({ session, itemId: doc._id, expectedStock: expected, newStock: Number(req.body.stock), actor: req.user, reason: req.body.stockReason || 'Stock edited on product form' });
    }
    const fresh = await Product.findById(doc._id).session(session);
    await audit({ session, actor: req.user, action: 'product.update', entity: 'Product', entityId: doc._id, before, after: { name: fresh.name, price: fresh.price, discountPrice: fresh.discountPrice, isActive: fresh.isActive, stock: fresh.stock }, req });
    return fresh;
  });
  res.status(200).json({ success: true, data: result });
});

// @route DELETE /api/v1/products/:id  (admin) — archive (soft delete)
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!product) throw new ApiError('Product not found.', 404);
  await audit({ actor: req.user, action: 'product.archive', entity: 'Product', entityId: product._id, req });
  res.status(200).json({ success: true, message: 'Product archived.' });
});

// @route DELETE /api/v1/products/:id/permanent  (admin) — refused if any order or stock history references it
exports.permanentlyDeleteProduct = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError('Product not found.', 404);
  const [inOrders, moves] = await Promise.all([
    Order.exists({ 'orderItems.product': id }),
    InventoryMovement.countDocuments({ item: id, type: { $ne: 'INITIAL' } }),
  ]);
  if (inOrders || moves > 0) {
    throw new ApiError('This product has order or stock history and cannot be permanently deleted. Archive it instead.', 409);
  }
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new ApiError('Product not found.', 404);
  await audit({ actor: req.user, action: 'product.delete', entity: 'Product', entityId: product._id, before: { name: product.name }, req });
  res.status(200).json({ success: true, message: 'Product permanently deleted.' });
});

// @route GET /api/v1/products/featured
exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isFeatured: true, isActive: true }).populate('category', 'name slug').sort('-updatedAt').limit(8);
  res.status(200).json({ success: true, count: products.length, data: products });
});

// @route GET /api/v1/products/new-arrivals
exports.getNewArrivals = asyncHandler(async (req, res) => {
  let products = await Product.find({ isNewArrival: true, isActive: true }).populate('category', 'name slug').sort('-createdAt').limit(8);
  if (!products.length) products = await Product.find({ isActive: true }).populate('category', 'name slug').sort('-createdAt').limit(8);
  res.status(200).json({ success: true, count: products.length, data: products });
});

// @route GET /api/v1/products/:id/related
exports.getRelatedProducts = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError('Product not found.', 404);
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError('Product not found.', 404);
  const related = await Product.find({ category: product.category, _id: { $ne: product._id }, isActive: true }).limit(6);
  res.status(200).json({ success: true, data: related });
});

// @route PATCH /api/v1/products/:id/stock  { stock, expectedStock, reason }  (admin) — compare-and-set
exports.updateStock = asyncHandler(async (req, res) => {
  const { stock, expectedStock, reason } = req.body;
  if (stock === undefined || expectedStock === undefined) {
    throw new ApiError('Provide both stock and expectedStock (the value you last saw).', 400);
  }
  const product = await withTransaction(async (session) => {
    const p = await inventory.setStock({ session, itemId: req.params.id, expectedStock, newStock: stock, actor: req.user, reason });
    await audit({ session, actor: req.user, action: 'stock.set', entity: 'Product', entityId: req.params.id, before: { stock: Number(expectedStock) }, after: { stock: Number(stock) }, meta: { reason }, req });
    return p;
  });
  res.status(200).json({ success: true, data: product });
});

// @route POST /api/v1/products/:id/stock-adjustments  { delta, reason }  (admin)
exports.adjustStock = asyncHandler(async (req, res) => {
  const { delta, reason } = req.body;
  const product = await withTransaction(async (session) => {
    const p = await inventory.adjustStock({ session, itemId: req.params.id, delta, actor: req.user, reason });
    await audit({ session, actor: req.user, action: 'stock.adjust', entity: 'Product', entityId: req.params.id, after: { stock: p.stock }, meta: { delta: Number(delta), reason }, req });
    return p;
  });
  res.status(200).json({ success: true, data: product });
});

// @route GET /api/v1/products/:id/stock-movements  (admin)
exports.getStockMovements = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError('Product not found.', 404);
  const { page, limit, skip } = paginate(req.query, { defaultLimit: 50, max: 200 });
  const filter = { item: req.params.id };
  const [rows, total] = await Promise.all([
    InventoryMovement.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('actor', 'name').populate('order', 'orderNumber'),
    InventoryMovement.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), data: rows });
});
