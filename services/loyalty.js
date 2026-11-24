const Order = require('../models/Order');
const User = require('../models/User');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const commerce = require('../config/commerce');
const ApiError = require('../utils/ApiError');

/**
 * Prime Collection (CP-CUST-040). Rules are configurable in config/commerce.js
 * and are PENDING CLIENT CONFIRMATION (DEC-11). Default:
 *   - a qualifying purchase is an order that is Delivered, PAID and not
 *     refunded (cancelled/expired/refunded orders never count);
 *   - every `purchasesPerReward` (5) qualifying purchases earn one reward,
 *     usable on a later order (the "6th order free gift");
 *   - orders that used a reward do not themselves count towards the next one.
 */

function qualifyingFilter(userId) {
  const p = commerce.prime;
  return {
    user: userId,
    orderStatus: { $in: p.qualifyingOrderStatuses },
    'payment.status': { $in: p.qualifyingPaymentStatuses },
    'primeReward.applied': { $ne: true },
    ...(p.minOrderPaise > 0 && { 'pricing.totalPaise': { $gte: p.minOrderPaise } }),
  };
}

async function getStatus(userId, session) {
  const [qualifying, user] = await Promise.all([
    Order.countDocuments(qualifyingFilter(userId)).session(session || null),
    User.findById(userId).select('loyalty').session(session || null),
  ]);
  const per = commerce.prime.purchasesPerReward;
  const earned = Math.floor(qualifying / per);
  const redeemed = user?.loyalty?.redeemedCount || 0;
  const available = Math.max(0, earned - redeemed);
  return {
    qualifyingPurchases: qualifying,
    purchasesPerReward: per,
    rewardsEarned: earned,
    rewardsRedeemed: redeemed,
    rewardsAvailable: available,
    progressToNext: qualifying % per,
    purchasesUntilNextReward: per - (qualifying % per),
    ruleStatus: 'PENDING_CLIENT_CONFIRMATION',
  };
}

/**
 * Redeem one reward for `orderId` inside the caller's transaction. The
 * conditional $inc on the user document serialises concurrent attempts, and
 * the unique ledger index stops a second redemption for the same order.
 */
async function redeem({ session, userId, orderId }) {
  const status = await getStatus(userId, session);
  const res = await User.updateOne(
    { _id: userId, 'loyalty.redeemedCount': { $lt: status.rewardsEarned } },
    { $inc: { 'loyalty.redeemedCount': 1 } },
    { session }
  );
  if (res.modifiedCount !== 1) {
    throw new ApiError('No Prime Collection reward is available on your account.', 409, { code: 'NO_REWARD' });
  }
  const rewardNumber = status.rewardsRedeemed + 1;
  await LoyaltyLedger.create(
    [{ user: userId, type: 'REDEEM', order: orderId, rewardNumber, qualifyingCountAtTime: status.qualifyingPurchases }],
    { session }
  );
  return { rewardNumber };
}

/** Give a reward back when the redeeming order is cancelled or expires. Idempotent. */
async function reverse({ session, userId, orderId, note }) {
  const already = await LoyaltyLedger.exists({ order: orderId, type: 'REVERSE' }).session(session);
  if (already) return false;
  const redeemed = await LoyaltyLedger.exists({ order: orderId, type: 'REDEEM' }).session(session);
  if (!redeemed) return false;
  await LoyaltyLedger.create([{ user: userId, type: 'REVERSE', order: orderId, note }], { session });
  await User.updateOne(
    { _id: userId, 'loyalty.redeemedCount': { $gt: 0 } },
    { $inc: { 'loyalty.redeemedCount': -1 } },
    { session }
  );
  return true;
}

module.exports = { getStatus, redeem, reverse, qualifyingFilter };
