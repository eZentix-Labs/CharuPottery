import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatPaise } from '../../utils/money';
import { fmtDate, errMsg } from './adminUi';

const EMPTY = { code: '', description: '', type: 'PERCENT', value: '', maxDiscount: '', minOrder: '', startsAt: '', endsAt: '', usageLimit: '', perUserLimit: 1, isPublic: true };

/** Coupon codes & offers (CP-CUST-020). Amounts are entered in rupees and stored in paise. */
export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/admin/coupons').then(({ data }) => setCoupons(data.data)).catch(() => toast.error('Failed to load coupons')), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/coupons', {
        code: form.code.trim().toUpperCase(),
        description: form.description,
        type: form.type,
        value: form.type === 'PERCENT' ? Math.round(Number(form.value) * 100) : Math.round(Number(form.value) * 100),
        maxDiscountPaise: form.maxDiscount ? Math.round(Number(form.maxDiscount) * 100) : undefined,
        minOrderPaise: form.minOrder ? Math.round(Number(form.minOrder) * 100) : 0,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perUserLimit: Number(form.perUserLimit) || 1,
        isPublic: form.isPublic,
      });
      toast.success('Coupon created');
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const toggle = async (c, field) => {
    try { await api.put(`/admin/coupons/${c._id}`, { [field]: !c[field] }); load(); }
    catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Coupons & Offers</h1>
          <p className="adm-sub">Public coupons appear in the storefront “Offers” section. Discounts are validated on the server at checkout.</p>
        </div>
      </div>
      <div className="adm-card">
        <h2>New coupon</h2>
        <form className="adm-form" onSubmit={create}>
          <label>Code<input className="form-input" required pattern="[A-Za-z0-9_-]{3,30}" title="3–30 letters, digits, - or _" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label>Type
            <select className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat ₹ off</option>
            </select>
          </label>
          <label>{form.type === 'PERCENT' ? 'Percent (%)' : 'Amount (₹)'}<input className="form-input" type="number" min="0.01" step="0.01" max={form.type === 'PERCENT' ? 100 : undefined} required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
          {form.type === 'PERCENT' && <label>Max discount (₹, optional)<input className="form-input" type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} /></label>}
          <label>Minimum order (₹)<input className="form-input" type="number" min="0" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} /></label>
          <label>Starts<input className="form-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label>Ends<input className="form-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label>Total uses (blank = unlimited)<input className="form-input" type="number" min="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></label>
          <label>Uses per customer<input className="form-input" type="number" min="1" value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} /></label>
          <label className="full">Description (shown to customers)<input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="adm-check"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Show in storefront offers</label>
          <div><button className="btn btn-primary adm-btn-sm" disabled={busy}>Create coupon</button></div>
        </form>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Valid</th><th>Used</th><th>Public</th><th>Active</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c._id}>
                <td className="mono">{c.code}<br /><span className="adm-sub">{c.description}</span></td>
                <td>{c.type === 'PERCENT' ? `${c.value / 100}%${c.maxDiscountPaise ? ` (max ${formatPaise(c.maxDiscountPaise)})` : ''}` : formatPaise(c.value)}</td>
                <td>{c.minOrderPaise ? formatPaise(c.minOrderPaise) : '—'}</td>
                <td>{c.startsAt ? fmtDate(c.startsAt) : 'now'} → {c.endsAt ? fmtDate(c.endsAt) : 'no end'}</td>
                <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td><button className="btn btn-ghost adm-btn-sm" onClick={() => toggle(c, 'isPublic')}>{c.isPublic ? 'Yes' : 'No'}</button></td>
                <td><button className={`btn adm-btn-sm ${c.isActive ? 'btn-outline' : 'btn-ghost'}`} onClick={() => toggle(c, 'isActive')}>{c.isActive ? 'Active' : 'Inactive'}</button></td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan={7} className="adm-empty">No coupons yet</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-sub">Tip: codes cannot be renamed after creation (past orders reference them). Deactivate a code instead of deleting it.</p>
    </div>
  );
}
