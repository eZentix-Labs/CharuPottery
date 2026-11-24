import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { FiAlertCircle } from 'react-icons/fi';
import { formatPaise } from '../../utils/money';
import { paymentPill, statusPill, fmtDate, errMsg } from './adminUi';

/** Business overview. Revenue = verified money only (paid online / COD cash recorded). */
export default function AdminDashboardPage() {
  const [d, setD] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/admin/dashboard'), api.get('/orders/analytics/summary')])
      .then(([a, b]) => { setD(a.data.data); setSummary(b.data.data); })
      .catch((err) => setError(errMsg(err, 'Failed to load dashboard')));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!d) return <div className="page-loader"><div className="spinner" /></div>;

  const kpis = [
    { label: 'Collected revenue (all time, verified)', value: formatPaise(summary?.netRevenuePaise) },
    { label: 'Revenue, last 30 days', value: formatPaise(d.revenueLast30DaysPaise) },
    { label: 'Orders to fulfil', value: d.pendingFulfilment, warn: d.pendingFulfilment > 0 },
    { label: `COD awaiting cash (${d.codAwaitingCollection.count})`, value: formatPaise(d.codAwaitingCollection.paise) },
    { label: 'Refunds outstanding', value: formatPaise(summary?.refundsOutstandingPaise), warn: summary?.refundsOutstandingPaise > 0 },
    { label: 'Customers', value: d.customers },
    { label: 'Repeat customers', value: d.repeatCustomers },
    { label: 'Reviews to moderate', value: d.reviewsPendingModeration, warn: d.reviewsPendingModeration > 0 },
  ];

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Dashboard</h1>
          <p className="adm-sub">{d.notes?.[0]}</p>
        </div>
      </div>

      {d.paymentsNeedingReview > 0 && (
        <div className="adm-note" role="alert"><FiAlertCircle /> {d.paymentsNeedingReview} payment(s) need review. <Link to="/admin/orders">Open orders</Link> and filter by “Needs review”.</div>
      )}
      {summary?.legacyUnverifiedPaidOrders > 0 && (
        <div className="adm-note">{summary.legacyUnverifiedPaidOrders} older order(s) were marked paid by the previous checkout without a verified payment. They are excluded from revenue (decision DEC-17 pending).</div>
      )}

      <div className="adm-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`adm-kpi${k.warn ? ' warn' : ''}`}>
            <div className="adm-kpi-value">{k.value}</div>
            <div className="adm-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="adm-grid-2">
        <div className="adm-card">
          <h2>Recent orders <Link to="/admin/orders" className="adm-sub" style={{ marginLeft: 'auto' }}>View all</Link></h2>
          <table className="adm-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead>
            <tbody>
              {d.recentOrders.map((o) => (
                <tr key={o._id}>
                  <td><Link to={`/admin/orders/${o._id}`} className="mono">{o.orderNumber || o._id.slice(-8).toUpperCase()}</Link><br /><span className="adm-sub">{fmtDate(o.createdAt)}</span></td>
                  <td>{o.user?.name || '—'}</td>
                  <td>{formatPaise(o.pricing?.totalPaise ?? Math.round((o.totalPrice || 0) * 100))}</td>
                  <td>{statusPill(o.orderStatus)}</td>
                  <td>{paymentPill(o.payment?.status)}</td>
                </tr>
              ))}
              {d.recentOrders.length === 0 && <tr><td colSpan={5} className="adm-empty">No orders yet</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="adm-page">
          <div className="adm-card">
            <h2><FiAlertCircle color="#B45309" /> Low stock</h2>
            {d.lowStockProducts.length === 0 && d.lowStockMaterials.length === 0 && <p className="adm-sub">Everything is above its low-stock level.</p>}
            <ul className="adm-timeline">
              {d.lowStockProducts.map((p) => <li key={p._id}><span><Link to={`/admin/products/${p._id}/edit`}>{p.name}</Link> — {p.stock} left (alert at {p.lowStockThreshold}){p.reservedStock ? `, ${p.reservedStock} reserved` : ''}</span></li>)}
              {d.lowStockMaterials.map((m) => <li key={m._id}><span><Link to="/admin/inventory">{m.name}</Link> ({m.category}) — {m.stock} {m.unit}</span></li>)}
            </ul>
          </div>
          <div className="adm-card">
            <h2>Orders by state</h2>
            <ul className="adm-timeline">
              {d.ordersByState.map((s) => <li key={s._id || 'unknown'}><span>{s._id || 'Unknown'}: {s.count}</span></li>)}
            </ul>
          </div>
          <div className="adm-card">
            <h2>Best sellers</h2>
            <ul className="adm-timeline">{d.topProducts.map((p) => <li key={p._id}><span>{p.name} — {p.soldCount} sold</span></li>)}</ul>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <h2>Recent admin activity</h2>
        <ul className="adm-timeline">
          {d.recentActivity.map((a) => <li key={a._id}><time>{fmtDate(a.createdAt)}</time><span>{a.action} · {a.entity}{a.actor?.name ? ` · ${a.actor.name}` : ''}</span></li>)}
          {d.recentActivity.length === 0 && <li className="adm-sub">No activity yet</li>}
        </ul>
      </div>
    </div>
  );
}
