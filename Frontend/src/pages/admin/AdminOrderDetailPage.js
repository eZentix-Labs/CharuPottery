import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatPaise, orderTotalPaise } from '../../utils/money';
import { paymentPill, statusPill, fmtDate, errMsg } from './adminUi';

const NEXT = {
  Pending: ['Processing'],
  Processing: ['Shipped'],
  Shipped: ['Out for Delivery', 'Delivered'],
  'Out for Delivery': ['Delivered'],
};

/**
 * Admin order detail. Money and stock actions are explicit, confirmed
 * buttons that call dedicated server endpoints (never a free status edit).
 */
export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState('');
  const [tracking, setTracking] = useState({ trackingNumber: '', carrier: '' });
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([api.get(`/orders/${id}`), api.get(`/orders/${id}/history`)]);
      setOrder(o.data.data);
      setHistory(h.data.data);
      setTracking({ trackingNumber: o.data.data.trackingNumber || '', carrier: o.data.data.carrier || '' });
      setNextStatus((NEXT[o.data.data.orderStatus] || [])[0] || '');
    } catch (err) { toast.error(errMsg(err, 'Failed to load order')); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try { await fn(); toast.success(success); await load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(''); }
  };

  if (!order) return <div className="page-loader"><div className="spinner" /></div>;

  const p = order.payment || {};
  const total = orderTotalPaise(order);
  const isCod = p.provider === 'COD';
  const canCancel = ['AwaitingPayment', 'Pending', 'Processing'].includes(order.orderStatus);
  const canCollect = isCod && p.status === 'PAYMENT_PENDING' && ['Out for Delivery', 'Delivered'].includes(order.orderStatus);
  const canRefund = p.status === 'PAID' && order.orderStatus === 'Delivered';
  const refundPendingManual = isCod && ['REFUND_PENDING', 'REFUND_FAILED'].includes(p.status);
  const refundFailedOnline = !isCod && p.status === 'REFUND_FAILED';
  const refundPendingOnline = !isCod && p.status === 'REFUND_PENDING';

  const updateStatus = () => act('status', () => api.put(`/orders/${id}/status`, { orderStatus: nextStatus || undefined, ...tracking, note }), 'Order updated');
  const collect = () => {
    if (!window.confirm(`Confirm that ${formatPaise(total)} cash was actually collected for this order?`)) return;
    act('collect', () => api.post(`/orders/${id}/cod/collect`, { amountPaise: total, note }), 'Cash collection recorded');
  };
  const cancel = () => {
    const reason = window.prompt('Reason for cancelling (shown to the customer):');
    if (!reason) return;
    act('cancel', () => api.post(`/orders/${id}/admin-cancel`, { reason }), 'Order cancelled');
  };
  const refund = () => {
    const reason = window.prompt('Refund reason (e.g. damaged in transit):');
    if (!reason) return;
    const restock = window.confirm('Return the items to sellable stock? (OK = yes, Cancel = no, e.g. if damaged)');
    act('refund', () => api.post(`/orders/${id}/refund`, { reason, restock }), isCod ? 'Refund pending — record it once you have paid the customer' : 'Refund sent to PhonePe');
  };
  const manualRefund = (outcome) => {
    if (outcome === 'SUCCEEDED') {
      const reference = window.prompt('Refund reference (UPI / bank transaction ID):');
      if (!reference) return;
      act('manual', () => api.post(`/orders/${id}/refund/manual`, { outcome, reference }), 'Refund recorded');
    } else {
      const reason = window.prompt('What went wrong with the refund?');
      if (!reason) return;
      act('manual', () => api.post(`/orders/${id}/refund/manual`, { outcome, note: reason }), 'Refund marked failed');
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <Link to="/admin/orders" className="adm-sub">← All orders</Link>
          <h1 className="adm-title">{order.orderNumber || `Order #${order._id.slice(-8).toUpperCase()}`}</h1>
          <p className="adm-sub">Placed {fmtDate(order.createdAt)} · {statusPill(order.orderStatus)} · {p.provider || order.paymentMethod} {paymentPill(p.status)}</p>
        </div>
        <div className="adm-actions">
          {canCancel && <button className="btn btn-outline adm-btn-sm adm-danger" onClick={cancel} disabled={!!busy}>Cancel order</button>}
          {canRefund && <button className="btn btn-outline adm-btn-sm adm-danger" onClick={refund} disabled={!!busy}>Refund</button>}
        </div>
      </div>

      {p.needsReview && <div className="adm-note" role="alert">⚠ Payment needs review: {p.reviewReason}</div>}

      <div className="adm-grid-2">
        <div className="adm-page">
          <div className="adm-card">
            <h2>Items</h2>
            <table className="adm-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
              <tbody>
                {order.orderItems.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name}</td>
                    <td>{it.quantity}</td>
                    <td>{formatPaise(it.unitPricePaise ?? Math.round(it.price * 100))}</td>
                    <td>{formatPaise(it.lineTotalPaise ?? Math.round(it.price * it.quantity * 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="adm-kv" style={{ marginTop: 12 }}>
              <dt>Subtotal</dt><dd>{formatPaise(order.pricing?.itemsPaise ?? Math.round(order.itemsPrice * 100))}</dd>
              {order.pricing?.discountPaise > 0 && <><dt>Discount</dt><dd>−{formatPaise(order.pricing.discountPaise)} ({order.pricing.couponCode})</dd></>}
              <dt>Tax</dt><dd>{formatPaise(order.pricing?.taxPaise ?? Math.round(order.taxPrice * 100))}</dd>
              <dt>Shipping</dt><dd>{formatPaise(order.pricing?.shippingPaise ?? Math.round(order.shippingPrice * 100))}</dd>
              <dt><strong>Total</strong></dt><dd><strong>{formatPaise(total)}</strong></dd>
              {order.primeReward?.applied && <><dt>Prime reward</dt><dd>🎁 Free gift #{order.primeReward.rewardNumber} — include it in the parcel</dd></>}
            </dl>
          </div>

          <div className="adm-card">
            <h2>Fulfilment</h2>
            <div className="adm-form">
              <label>Next status
                <select className="form-input" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} disabled={!NEXT[order.orderStatus]}>
                  <option value="">— keep {order.orderStatus} —</option>
                  {(NEXT[order.orderStatus] || []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Tracking number<input className="form-input" value={tracking.trackingNumber} onChange={(e) => setTracking({ ...tracking, trackingNumber: e.target.value })} /></label>
              <label>Carrier<input className="form-input" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} /></label>
              <label className="full">Note (optional)<input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div><button className="btn btn-primary adm-btn-sm" onClick={updateStatus} disabled={!!busy}>{busy === 'status' ? 'Saving…' : 'Save'}</button></div>
            </div>
            <p className="adm-sub" style={{ marginTop: 8 }}>Cancelled, Refunded and Paid cannot be set here — use the dedicated actions so stock and money stay consistent.</p>
          </div>

          <div className="adm-card">
            <h2>History</h2>
            <ul className="adm-timeline">
              {[...(order.statusHistory || [])].reverse().map((h, i) => (
                <li key={i}><time>{fmtDate(h.changedAt)}</time><span><strong>{h.status}</strong>{h.note ? ` — ${h.note}` : ''}{h.actorRole ? ` (${h.actorRole})` : ''}</span></li>
              ))}
            </ul>
          </div>

          {history && (
            <div className="adm-card">
              <h2>Payment, stock and audit trail</h2>
              <ul className="adm-timeline">
                {history.payments.map((t) => <li key={t._id}><time>{fmtDate(t.createdAt)}</time><span>Payment · {t.kind} · {t.outcome}{t.amountPaise ? ` · ${formatPaise(t.amountPaise)}` : ''}{t.actor?.name ? ` · by ${t.actor.name}` : ''}</span></li>)}
                {history.movements.map((m) => <li key={m._id}><time>{fmtDate(m.createdAt)}</time><span>Stock · {m.type} {m.quantity} × {m.item?.name || 'item'} (available after: {m.availableAfter})</span></li>)}
                {history.audits.map((a) => <li key={a._id}><time>{fmtDate(a.createdAt)}</time><span>Audit · {a.action}{a.actor?.name ? ` · ${a.actor.name}` : ''}</span></li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="adm-page">
          <div className="adm-card">
            <h2>Payment</h2>
            <dl className="adm-kv">
              <dt>Method</dt><dd>{isCod ? 'Cash on Delivery' : p.provider || order.paymentMethod}</dd>
              <dt>Status</dt><dd>{paymentPill(p.status)}</dd>
              <dt>Amount</dt><dd>{formatPaise(p.amountPaise ?? total)}</dd>
              {p.merchantOrderId && <><dt>Merchant order</dt><dd className="mono">{p.merchantOrderId}</dd></>}
              {p.transactionId && <><dt>Transaction</dt><dd className="mono">{p.transactionId}</dd></>}
              {p.paidAt && <><dt>Paid at</dt><dd>{fmtDate(p.paidAt)}</dd></>}
              {p.codCollection?.collectedAt && <><dt>Cash collected</dt><dd>{fmtDate(p.codCollection.collectedAt)} · {formatPaise(p.codCollection.amountPaise)}</dd></>}
              {p.refund?.status && p.refund.status !== 'NONE' && <><dt>Refund</dt><dd>{p.refund.status} · {formatPaise(p.refund.amountPaise)}{p.refund.reference ? ` · ref ${p.refund.reference}` : ''}{p.refund.failureReason ? ` · ${p.refund.failureReason}` : ''}</dd></>}
            </dl>
            <div className="adm-actions" style={{ marginTop: 12 }}>
              {canCollect && <button className="btn btn-primary adm-btn-sm" onClick={collect} disabled={!!busy}>Record cash collected ({formatPaise(total)})</button>}
              {isCod && p.status === 'PAYMENT_PENDING' && !canCollect && <p className="adm-sub">Cash can be recorded once the order is Out for Delivery or Delivered.</p>}
              {refundPendingManual && (
                <>
                  <button className="btn btn-primary adm-btn-sm" onClick={() => manualRefund('SUCCEEDED')} disabled={!!busy}>Record refund paid</button>
                  <button className="btn btn-outline adm-btn-sm" onClick={() => manualRefund('FAILED')} disabled={!!busy}>Mark refund failed</button>
                </>
              )}
              {refundFailedOnline && <button className="btn btn-primary adm-btn-sm" onClick={() => act('retry', () => api.post(`/orders/${id}/refund/retry`), 'Refund retried')} disabled={!!busy}>Retry refund</button>}
              {refundPendingOnline && <button className="btn btn-outline adm-btn-sm" onClick={() => act('rec', () => api.post(`/orders/${id}/refund/reconcile`), 'Refund status checked')} disabled={!!busy}>Check refund status</button>}
              {!isCod && p.status === 'PAYMENT_PENDING' && <button className="btn btn-outline adm-btn-sm" onClick={() => act('payrec', () => api.post(`/orders/${id}/payment/reconcile`), 'Payment status checked')} disabled={!!busy}>Check payment status</button>}
            </div>
          </div>

          <div className="adm-card">
            <h2>Customer & delivery</h2>
            <dl className="adm-kv">
              <dt>Customer</dt><dd>{order.user?.name}<br /><span className="adm-sub">{order.user?.email}</span></dd>
              <dt>Ship to</dt><dd>{order.shippingAddress?.fullName}<br />{order.shippingAddress?.street}<br />{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.postalCode}<br />{order.shippingAddress?.phone}</dd>
              <dt>Source</dt><dd>{order.source?.channel || '—'}{order.source?.utmSource ? ` · ${order.source.utmSource}` : ''}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
