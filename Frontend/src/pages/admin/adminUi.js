import React from 'react';

export const paymentPill = (status) => {
  const cls = { PAID: 'ok', REFUNDED: 'info', PAYMENT_PENDING: 'warn', REFUND_PENDING: 'warn', REFUND_FAILED: 'bad', FAILED: 'bad', VOIDED: '' }[status] ?? '';
  return <span className={`adm-pill ${cls}`}>{status ? status.replace(/_/g, ' ').toLowerCase() : 'legacy'}</span>;
};

export const statusPill = (status) => {
  const cls = { Delivered: 'ok', Shipped: 'info', 'Out for Delivery': 'info', Cancelled: 'bad', Expired: 'bad', Refunded: 'info', AwaitingPayment: 'warn', Pending: 'warn' }[status] ?? '';
  return <span className={`adm-pill ${cls}`}>{status}</span>;
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export const errMsg = (err, fallback = 'Something went wrong') => err?.response?.data?.message || fallback;

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="adm-pager">
      <button className="btn btn-ghost adm-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <span>Page {page} of {pages}</span>
      <button className="btn btn-ghost adm-btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}
