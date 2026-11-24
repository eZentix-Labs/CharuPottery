import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatPaise, orderTotalPaise } from '../../utils/money';
import { paymentPill, statusPill, fmtDate, Pager } from './adminUi';

const STATUSES = ['AwaitingPayment', 'Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Refunded', 'Expired'];
const PAYMENTS = ['PAYMENT_PENDING', 'PAID', 'FAILED', 'VOIDED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'];

/** Admin order list with server-side search and filters. */
export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', status: '', paymentStatus: '', provider: '', needsReview: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/orders', { params });
      setOrders(data.data || []);
      setMeta({ total: data.total, pages: data.pages });
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Orders</h1>
          <p className="adm-sub">{meta.total} orders</p>
        </div>
      </div>

      <div className="adm-toolbar">
        <input className="form-input" placeholder="Search order no., customer, phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        <select className="form-input" value={filters.status} onChange={(e) => setF('status', e.target.value)} aria-label="Order status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input" value={filters.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)} aria-label="Payment status">
          <option value="">All payments</option>
          {PAYMENTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
        </select>
        <select className="form-input" value={filters.provider} onChange={(e) => setF('provider', e.target.value)} aria-label="Payment method">
          <option value="">All methods</option>
          <option value="COD">Cash on Delivery</option>
          <option value="PHONEPE">PhonePe</option>
        </select>
        <label className="adm-check"><input type="checkbox" checked={filters.needsReview === 'true'} onChange={(e) => setF('needsReview', e.target.checked ? 'true' : '')} /> Needs review</label>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>Order</th><th>Date</th><th>Customer</th><th>Ship to</th><th>Total</th><th>Status</th><th>Payment</th><th>Source</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="adm-empty">Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={8} className="adm-empty">No orders match these filters</td></tr>
            ) : orders.map((o) => (
              <tr key={o._id} className="clickable" onClick={() => navigate(`/admin/orders/${o._id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/orders/${o._id}`)}>
                <td className="mono">{o.orderNumber || `#${o._id.slice(-8).toUpperCase()}`}{o.payment?.needsReview && <span className="adm-pill bad" style={{ marginLeft: 6 }}>review</span>}</td>
                <td>{fmtDate(o.createdAt)}</td>
                <td>{o.user?.name || '—'}<br /><span className="adm-sub">{o.user?.email}</span></td>
                <td>{o.shippingAddress?.city}, {o.shippingAddress?.state}</td>
                <td>{formatPaise(orderTotalPaise(o))}</td>
                <td>{statusPill(o.orderStatus)}</td>
                <td>{o.payment ? <>{o.payment.provider} · {paymentPill(o.payment.status)}</> : <span className="adm-pill">legacy</span>}</td>
                <td>{o.source?.utmSource || o.source?.channel || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={meta.pages} onPage={setPage} />
    </div>
  );
}
