const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const SiteContent = require('../models/SiteContent');
const Coupon = require('../models/Coupon');
const ApiError = require('../utils/ApiError');
const { storeLocal } = require('../services/mediaStorage');
const { audit } = require('../services/audit');

// ─── validation helpers ───────────────────────────────────────────────────

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Only https links, site-relative links, mailto:, tel: and WhatsApp deep links.
const safeUrl = (v) => {
  const s = str(v, 400);
  if (!s) return '';
  if (/^(https:\/\/|\/(?!\/)|mailto:|tel:)/i.test(s)) return s;
  throw new ApiError(`Invalid link "${s.slice(0, 60)}". Use https:// or a site path starting with /.`, 400);
};
const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn) : []);

const SOCIAL_KEYS = ['instagram', 'facebook', 'youtube', 'whatsapp', 'pinterest', 'x', 'linkedin'];

/** Normalise the brand content document. Unknown fields are dropped. */
function normalizeBrand(d = {}) {
  const social = {};
  for (const k of SOCIAL_KEYS) social[k] = safeUrl(d.social?.[k]);
  return {
    tagline: str(d.tagline, 150),
    about: str(d.about, 3000),
    story: str(d.story, 6000),
    founders: list(d.founders, 6, (f) => ({
      name: str(f?.name, 80),
      role: str(f?.role, 60), // e.g. Founder, Co-Founder
      bio: str(f?.bio, 1500),
      photo: safeUrl(f?.photo),
    })),
    workshop: {
      name: str(d.workshop?.name, 100),
      address: str(d.workshop?.address, 400),
      city: str(d.workshop?.city, 60),
      mapUrl: safeUrl(d.workshop?.mapUrl),
      hours: str(d.workshop?.hours, 200),
      phone: str(d.workshop?.phone, 20),
      email: str(d.workshop?.email, 120),
      visitingInfo: str(d.workshop?.visitingInfo, 1000),
    },
    social,
    // Admin-curated posts/reels (DEC-09: no scraping; official API not configured)
    socialPosts: list(d.socialPosts, 12, (p) => ({
      platform: ['instagram', 'facebook', 'youtube', 'other'].includes(p?.platform) ? p.platform : 'other',
      url: safeUrl(p?.url),
      caption: str(p?.caption, 200),
      thumbnail: safeUrl(p?.thumbnail),
    })),
    weeklyUpdates: list(d.weeklyUpdates, 10, (u) => ({
      title: str(u?.title, 120),
      body: str(u?.body, 800),
      date: u?.date && !Number.isNaN(new Date(u.date).getTime()) ? new Date(u.date) : null,
      link: safeUrl(u?.link),
    })),
    contentStatus: str(d.contentStatus, 40) || 'PLACEHOLDER_UNTIL_CLIENT_SUPPLIES', // DEC-13
  };
}

// ─── public ───────────────────────────────────────────────────────────────

// @route GET /api/v1/content/brand
exports.getBrand = asyncHandler(async (req, res) => {
  const doc = await SiteContent.findOne({ key: 'brand' });
  res.status(200).json({ success: true, data: doc ? doc.data : normalizeBrand({}) });
});

// @route GET /api/v1/content/banners?placement=home_hero
exports.getActiveBanners = asyncHandler(async (req, res) => {
  const now = new Date();
  const placement = ['home_hero', 'home_offer'].includes(req.query.placement) ? req.query.placement : 'home_hero';
  const banners = await Banner.find({
    placement,
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
    ],
  })
    .select('-updatedBy')
    .sort('sortOrder -createdAt')
    .limit(10);
  res.status(200).json({ success: true, data: banners });
});

// @route GET /api/v1/content/offers — public coupons currently valid
exports.getPublicOffers = asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    isPublic: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
    ],
  })
    .select('code description type value maxDiscountPaise minOrderPaise endsAt usageLimit usedCount')
    .sort('-createdAt')
    .limit(12);
  const data = coupons
    .filter((c) => !c.usageLimit || c.usedCount < c.usageLimit)
    .map((c) => ({ code: c.code, description: c.description, type: c.type, value: c.value, maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, endsAt: c.endsAt }));
  res.status(200).json({ success: true, data });
});

// ─── admin ────────────────────────────────────────────────────────────────

// @route PUT /api/v1/content/brand  (admin)
exports.updateBrand = asyncHandler(async (req, res) => {
  const data = normalizeBrand(req.body || {});
  const doc = await SiteContent.findOneAndUpdate(
    { key: 'brand' },
    { $set: { data, updatedBy: req.user._id } },
    { new: true, upsert: true }
  );
  await audit({ actor: req.user, action: 'content.brand_update', entity: 'SiteContent', entityId: doc._id, req });
  res.status(200).json({ success: true, data: doc.data });
});

// @route POST /api/v1/content/media  (admin) — upload a content image (founder photo, banner)
exports.uploadContentImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError('Please attach an image.', 400);
  const stored = storeLocal(req.file.buffer, { folder: 'content', allow: ['image'], prefix: 'content' });
  res.status(201).json({ success: true, data: { url: stored.url, public_id: stored.public_id } });
});

function bannerFields(b) {
  const out = {
    title: str(b.title, 100),
    subtitle: str(b.subtitle, 200),
    link: safeUrl(b.link),
    ctaLabel: str(b.ctaLabel, 40),
    placement: ['home_hero', 'home_offer'].includes(b.placement) ? b.placement : 'home_hero',
    sortOrder: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
    isActive: b.isActive !== false && b.isActive !== 'false',
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
  };
  if (b.image?.url) out.image = { url: safeUrl(b.image.url), public_id: str(b.image.public_id, 200), altText: str(b.image.altText, 150) };
  if (!out.title) throw new ApiError('Banner title is required.', 400);
  return out;
}

// @route GET /api/v1/content/admin/banners
exports.listBanners = asyncHandler(async (req, res) => {
  const banners = await Banner.find().sort('placement sortOrder -createdAt');
  res.status(200).json({ success: true, data: banners });
});

// @route POST /api/v1/content/admin/banners
exports.createBanner = asyncHandler(async (req, res) => {
  const fields = bannerFields(req.body);
  if (!fields.image) throw new ApiError('Banner image is required.', 400);
  const banner = await Banner.create({ ...fields, updatedBy: req.user._id });
  await audit({ actor: req.user, action: 'banner.create', entity: 'Banner', entityId: banner._id, req });
  res.status(201).json({ success: true, data: banner });
});

// @route PUT /api/v1/content/admin/banners/:id
exports.updateBanner = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError('Banner not found.', 404);
  const banner = await Banner.findByIdAndUpdate(req.params.id, { ...bannerFields(req.body), updatedBy: req.user._id }, { new: true, runValidators: true });
  if (!banner) throw new ApiError('Banner not found.', 404);
  await audit({ actor: req.user, action: 'banner.update', entity: 'Banner', entityId: banner._id, req });
  res.status(200).json({ success: true, data: banner });
});

// @route DELETE /api/v1/content/admin/banners/:id
exports.deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new ApiError('Banner not found.', 404);
  await audit({ actor: req.user, action: 'banner.delete', entity: 'Banner', entityId: banner._id, before: { title: banner.title }, req });
  res.status(200).json({ success: true });
});

exports.normalizeBrand = normalizeBrand;
