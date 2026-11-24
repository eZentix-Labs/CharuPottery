const Notification = require('../models/Notification');

const ORDER_MESSAGES = {
  placed: (o) => ({ title: `Order ${o.orderNumber} placed`, body: o.payment?.provider === 'COD' ? 'Pay in cash when your order arrives.' : 'Complete your payment to confirm the order.' }),
  paid: (o) => ({ title: `Payment received for ${o.orderNumber}`, body: 'Thank you! We are preparing your order.' }),
  status: (o) => ({ title: `Order ${o.orderNumber}: ${o.orderStatus}`, body: o.trackingNumber ? `Tracking: ${o.carrier || ''} ${o.trackingNumber}`.trim() : undefined }),
  cancelled: (o) => ({ title: `Order ${o.orderNumber} cancelled`, body: o.payment?.status === 'REFUND_PENDING' ? 'Your refund is being processed.' : undefined }),
  refunded: (o) => ({ title: `Refund completed for ${o.orderNumber}`, body: undefined }),
};

/** In-site notification for an order event. Never throws into the caller's flow. */
async function orderEvent(order, kind) {
  const build = ORDER_MESSAGES[kind];
  if (!build || !order?.user) return;
  const { title, body } = build(order);
  await Notification.create({ audience: 'user', user: order.user, type: 'order', title, body, link: `/my-orders/${order._id}` });
}

module.exports = { orderEvent };
