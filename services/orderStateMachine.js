/**
 * Allowed fulfilment transitions, per actor. Everything not listed is refused.
 * Cancellation, payment, expiry and refunds are NOT available through the
 * generic admin status endpoint: they have dedicated services that move
 * stock and money together.
 */
const ADMIN_STATUS_TRANSITIONS = {
  Pending: ['Processing'],
  Processing: ['Shipped'],
  Shipped: ['Out for Delivery', 'Delivered'],
  'Out for Delivery': ['Delivered'],
};

// Statuses from which an order may be cancelled (DEC-06: before Shipped).
const CANCELLABLE_STATUSES = ['AwaitingPayment', 'Pending', 'Processing'];

// Fulfilment statuses at which COD cash collection may be recorded.
const COD_COLLECTABLE_STATUSES = ['Out for Delivery', 'Delivered'];

// Statuses that must never be set through the generic admin status edit.
const PROTECTED_STATUSES = ['AwaitingPayment', 'Cancelled', 'Refunded', 'Expired'];

function canAdminTransition(from, to) {
  return (ADMIN_STATUS_TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  ADMIN_STATUS_TRANSITIONS,
  CANCELLABLE_STATUSES,
  COD_COLLECTABLE_STATUSES,
  PROTECTED_STATUSES,
  canAdminTransition,
};
