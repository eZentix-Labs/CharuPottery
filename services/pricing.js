const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const commerce = require('../config/commerce');
const { toPaise, toRupees, applyBps } = require('../utils/money');

/**
 * Server-side pricing. Cart prices are a display snapshot only and are never
 * trusted: every line is repriced from the current product.
 *
 *   items    = Σ unitPrice × qty           (current finalPrice)
 *   discount = coupon (validated now)
 *   tax      = taxRate × (items − discount) (PROVISIONAL, DEC-05)
 *   shipping = flat, free above threshold   (PROVISIONAL, DEC-04)
 *   total    = items − discount + tax + shipping
 */

function shippingFor(itemsPaise) {
  return itemsPaise > commerce.freeShippingAbovePaise ? 0 : commerce.shippingFlatPaise;
}

/**
 * Validate a coupon code for this user and items total.
 * @returns {{ coupon, discountPaise, error? }}
 */
async function evaluateCoupon({ code, userId, itemsPaise, session, now = new Date() }) {
  if (!code) return { coupon: null, discountPaise: 0 };
  const normalized = String(code).trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: normalized }).session(session || null);
  const fail = (error) => ({ coupon: null, discountPaise: 0, error });
  if (!coupon || !coupon.isActive) return fail('This coupon code is not valid.');
  if (coupon.startsAt && now < coupon.startsAt) return fail('This coupon is not active yet.');
  if (coupon.endsAt && now > coupon.endsAt) return fail('This coupon has expired.');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return fail('This coupon has reached its usage limit.');
  if (itemsPaise < (coupon.minOrderPaise || 0)) {
    return fail(`This coupon needs a minimum order of ₹${toRupees(coupon.minOrderPaise)}.`);
  }
  if (userId && coupon.perUserLimit) {
    const used = await CouponRedemption.countDocuments({ coupon: coupon._id, user: userId, status: 'ACTIVE' }).session(session || null);
    if (used >= coupon.perUserLimit) return fail('You have already used this coupon.');
  }
  let discountPaise =
    coupon.type === 'PERCENT' ? applyBps(itemsPaise, coupon.value) : coupon.value;
  if (coupon.type === 'PERCENT' && coupon.maxDiscountPaise) discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  discountPaise = Math.max(0, Math.min(discountPaise, itemsPaise));
  return { coupon, discountPaise };
}

/**
 * Reprice cart items.
 * @param {Array<{product, quantity, price?}>} items cart lines (price = old snapshot, rupees)
 * @returns quote with integer-paise totals, per-line details and a list of problems
 */
async function priceItems(items, { couponCode, userId, session } = {}) {
  const problems = [];
  const ids = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: ids } }).session(session || null);
  const byId = new Map(products.map((p) => [String(p._id), p]));

  if (items.length > commerce.maxLinesPerOrder) {
    problems.push({ code: 'TOO_MANY_LINES', message: `An order can contain at most ${commerce.maxLinesPerOrder} different items.` });
  }

  const lines = [];
  for (const item of items) {
    const product = byId.get(String(item.product));
    const quantity = Number(item.quantity);
    if (!product || !product.isActive) {
      problems.push({ code: 'UNAVAILABLE', productId: String(item.product), name: item.name, message: `"${item.name || 'An item'}" is no longer available.` });
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > commerce.maxQuantityPerLine) {
      problems.push({ code: 'INVALID_QUANTITY', productId: String(product._id), name: product.name, message: `Quantity for "${product.name}" must be between 1 and ${commerce.maxQuantityPerLine}.` });
      continue;
    }
    if (product.stock < quantity) {
      problems.push({ code: 'INSUFFICIENT_STOCK', productId: String(product._id), name: product.name, available: product.stock, message: `Only ${product.stock} unit(s) of "${product.name}" available.` });
    }
    const unitPricePaise = toPaise(product.finalPrice);
    const previousUnitPricePaise = item.price != null ? toPaise(item.price) : null;
    lines.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0]?.url || '',
      quantity,
      unitPricePaise,
      lineTotalPaise: unitPricePaise * quantity,
      available: product.stock,
      priceChanged: previousUnitPricePaise !== null && previousUnitPricePaise !== unitPricePaise,
      previousUnitPricePaise,
    });
  }

  const itemsPaise = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const couponResult = await evaluateCoupon({ code: couponCode, userId, itemsPaise, session });
  if (couponResult.error) problems.push({ code: 'COUPON_INVALID', message: couponResult.error });
  const discountPaise = couponResult.discountPaise;
  const taxPaise = applyBps(itemsPaise - discountPaise, commerce.taxRateBasisPoints);
  const shippingPaise = lines.length ? shippingFor(itemsPaise) : 0;
  const totalPaise = itemsPaise - discountPaise + taxPaise + shippingPaise;

  return {
    currency: commerce.currency,
    lines,
    itemsPaise,
    discountPaise,
    taxPaise,
    shippingPaise,
    totalPaise,
    taxRateBasisPoints: commerce.taxRateBasisPoints,
    couponCode: couponResult.coupon ? couponResult.coupon.code : null,
    coupon: couponResult.coupon,
    priceChanged: lines.some((l) => l.priceChanged),
    problems,
  };
}

/** JSON-safe view of a quote (no Mongoose documents). */
function publicQuote(q) {
  return {
    currency: q.currency,
    lines: q.lines.map((l) => ({
      product: String(l.product),
      name: l.name,
      image: l.image,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      lineTotalPaise: l.lineTotalPaise,
      available: l.available,
      priceChanged: l.priceChanged,
      previousUnitPricePaise: l.previousUnitPricePaise,
    })),
    itemsPaise: q.itemsPaise,
    discountPaise: q.discountPaise,
    taxPaise: q.taxPaise,
    shippingPaise: q.shippingPaise,
    totalPaise: q.totalPaise,
    taxRateBasisPoints: q.taxRateBasisPoints,
    couponCode: q.couponCode,
    priceChanged: q.priceChanged,
    problems: q.problems,
    freeShippingAbovePaise: commerce.freeShippingAbovePaise,
  };
}

module.exports = { priceItems, evaluateCoupon, publicQuote, shippingFor };
