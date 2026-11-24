/** Customer-facing wording for order and payment states. */
export const PAYMENT_LABEL = {
  PAYMENT_PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  VOIDED: 'No payment taken',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
  REFUND_FAILED: 'Refund delayed — our team is on it',
};

export function paymentLabel(order) {
  const p = order?.payment;
  if (!p) return order?.isPaid ? 'Paid' : 'Payment pending';
  if (p.provider === 'COD' && p.status === 'PAYMENT_PENDING') return 'Cash on Delivery — pay when it arrives';
  return PAYMENT_LABEL[p.status] || p.status;
}

export const STATUS_BADGE = {
  AwaitingPayment: 'badge-clay',
  Pending: 'badge-clay',
  Processing: 'badge-clay',
  Shipped: 'badge-success',
  'Out for Delivery': 'badge-success',
  Delivered: 'badge-success',
  Cancelled: 'badge-error',
  Refunded: 'badge-error',
  Expired: 'badge-error',
};

export const STATUS_LABEL = { AwaitingPayment: 'Awaiting payment' };
export const statusLabel = (s) => STATUS_LABEL[s] || s;
