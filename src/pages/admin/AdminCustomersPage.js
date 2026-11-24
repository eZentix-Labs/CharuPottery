import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatPaise } from '../../utils/money';
import { paymentPill, statusPill, fmtDate, errMsg, Pager } from './adminUi';

/** Customer database (CP-ADMIN-030). Viewing a customer's details is audited. */
export default function AdminCustomersPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/customers', { params: { page, q: q || undefined, whatsappOptIn: optIn ? 'true' : undefined } });
    setRows(data.data);
    setMeta({ total: data.total, pages: data.pages });
  }, [page, q, optIn]);

  useEffect(() => {
    const t = setTimeout(() => load().catch(() => toast.error('Failed to load customers')), 300);
    return () => clearTimeout(t);
  }, [load]);

  const open = async (id) => {
    try { const { data } = await api.get(`/admin/customers/${id}`); setSelected(data.data); }
    catch (err) { toast.error(errMsg(err)); }
  };

  const toggleActive = async () => {
    const c = selected.customer;
    if (!window.confirm(`${c.isActive ? 'Deactivate' : 'Reactivate'} ${c.name}'s account?`)) return;
    try {
      await api.patch(`/admin/customers/${c._id}/status`, { isActive: !c.isActive });
      toast.success('Account updated');
      open(c._id);
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Customers</h1>
          <p className="adm-sub">{meta.total} registered customers · personal data — view only what you need</p>
        </div>
      </div>
      <div className="adm-toolbar">
        <input className="form-input" placeholder="Search name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label className="adm-check"><input type="checkbox" checked={optIn} onChange={(e) => { setOptIn(e.target.checked); setPage(1); }} /> WhatsApp opted-in only</label>
      </div>
      <div className="adm-grid-2">
        <div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Paid</th><th>Last order</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id} className="clickable" onClick={() => open(c._id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(c._id)}>
                    <td>{c.name}{!c.isActive && <span className="adm-pill bad" style={{ marginLeft: 6 }}>inactive</span>}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.orders}</td>
                    <td>{formatPaise(c.paidPaise)}</td>
                    <td>{c.lastOrderAt ? fmtDate(c.lastOrderAt) : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="adm-empty">No customers found</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={meta.pages} onPage={setPage} />
        </div>
        <div>
          {!selected ? <div className="adm-card adm-sub">Select a customer to see details.</div> : (
            <div className="adm-card">
              <h2>{selected.customer.name}</h2>
              <dl className="adm-kv">
                <dt>Email</dt><dd>{selected.customer.email}</dd>
                <dt>Phone</dt><dd>{selected.customer.phone || '—'}</dd>
                <dt>Joined</dt><dd>{fmtDate(selected.customer.createdAt)}</dd>
                <dt>WhatsApp offers</dt><dd>{selected.customer.marketingConsent?.whatsapp?.optedIn ? `Opted in ${fmtDate(selected.customer.marketingConsent.whatsapp.optedInAt)}` : 'Not opted in'}</dd>
                <dt>Paid total</dt><dd>{formatPaise(selected.totals.paidPaise)} over {selected.totals.orders} orders</dd>
                <dt>Prime Collection</dt><dd>{selected.prime.qualifyingPurchases} qualifying · {selected.prime.rewardsAvailable} reward(s) available · {selected.prime.rewardsRedeemed} redeemed</dd>
                <dt>Addresses</dt>
                <dd>{(selected.customer.addresses || []).map((a) => <div key={a._id}>{a.label}: {a.street}, {a.city}, {a.state} {a.postalCode}</div>)}{!selected.customer.addresses?.length && '—'}</dd>
              </dl>
              <h2 style={{ marginTop: 16 }}>Orders</h2>
              <ul className="adm-timeline">
                {selected.orders.map((o) => (
                  <li key={o._id}><time>{fmtDate(o.createdAt)}</time><span><Link to={`/admin/orders/${o._id}`} className="mono">{o.orderNumber || o._id.slice(-8)}</Link> {statusPill(o.orderStatus)} {paymentPill(o.payment?.status)}</span></li>
                ))}
              </ul>
              <div className="adm-actions" style={{ marginTop: 12 }}>
                <button className={`btn btn-outline adm-btn-sm ${selected.customer.isActive ? 'adm-danger' : ''}`} onClick={toggleActive}>{selected.customer.isActive ? 'Deactivate account' : 'Reactivate account'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
