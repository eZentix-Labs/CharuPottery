const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const ApiError = require('../utils/ApiError');
const loyalty = require('../services/loyalty');

function visibleFilter(userId) {
  const now = new Date();
  return {
    $and: [
      { $or: [{ audience: 'user', user: userId }, { audience: 'all' }] },
      { $or: [{ activeFrom: null }, { activeFrom: { $exists: false } }, { activeFrom: { $lte: now } }] },
      { $or: [{ activeUntil: null }, { activeUntil: { $exists: false } }, { activeUntil: { $gte: now } }] },
    ],
  };
}

// @route GET /api/v1/account/notifications
exports.getNotifications = asyncHandler(async (req, res) => {
  const rows = await Notification.find(visibleFilter(req.user._id)).sort('-createdAt').limit(50).lean();
  const uid = String(req.user._id);
  const data = rows.map((n) => ({
    _id: n._id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: n.audience === 'user' ? !!n.readAt : (n.readBy || []).some((u) => String(u) === uid),
  }));
  res.status(200).json({ success: true, unread: data.filter((d) => !d.read).length, data });
});

// @route POST /api/v1/account/notifications/:id/read
exports.markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError('Notification not found.', 404);
  const n = await Notification.findOne({ _id: req.params.id, ...visibleFilter(req.user._id) });
  if (!n) throw new ApiError('Notification not found.', 404);
  if (n.audience === 'user') await Notification.updateOne({ _id: n._id }, { $set: { readAt: new Date() } });
  else await Notification.updateOne({ _id: n._id }, { $addToSet: { readBy: req.user._id } });
  res.status(200).json({ success: true });
});

// @route POST /api/v1/account/notifications/read-all
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ audience: 'user', user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  await Notification.updateMany({ audience: 'all' }, { $addToSet: { readBy: req.user._id } });
  res.status(200).json({ success: true });
});

// @route GET /api/v1/account/loyalty  — Prime Collection progress
exports.getLoyalty = asyncHandler(async (req, res) => {
  const status = await loyalty.getStatus(req.user._id);
  const history = await LoyaltyLedger.find({ user: req.user._id }).sort('-createdAt').limit(20).populate('order', 'orderNumber');
  res.status(200).json({ success: true, data: { ...status, history } });
});

// @route PUT /api/v1/account/consent  { whatsapp?: boolean, email?: boolean }
exports.updateConsent = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const now = new Date();
  for (const ch of ['whatsapp', 'email']) {
    if (typeof req.body[ch] !== 'boolean') continue;
    const cur = user.marketingConsent?.[ch] || {};
    if (req.body[ch]) {
      if (ch === 'whatsapp' && !user.phone) throw new ApiError('Add a mobile number to your profile before opting in to WhatsApp.', 400);
      user.set(`marketingConsent.${ch}`, { optedIn: true, optedInAt: now, optedOutAt: cur.optedOutAt, source: 'profile' });
    } else if (cur.optedIn) {
      user.set(`marketingConsent.${ch}`, { optedIn: false, optedInAt: cur.optedInAt, optedOutAt: now, source: 'profile' });
    }
  }
  await user.save();
  res.status(200).json({ success: true, data: user.marketingConsent });
});
