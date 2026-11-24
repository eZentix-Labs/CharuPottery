import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { fmtDate, errMsg } from './adminUi';

/**
 * Website notifications (live) and WhatsApp campaigns (CP-ADMIN-031).
 * WhatsApp is a compliant integration point only: messages go solely to
 * customers who opted in, and nothing is sent until a provider and approved
 * templates are configured (DEC-07).
 */
export default function AdminMarketingPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', link: '', type: 'offer', activeUntil: '' });
  const [wa, setWa] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [n, s, c] = await Promise.all([api.get('/admin/notifications'), api.get('/admin/campaigns/whatsapp/status'), api.get('/admin/campaigns')]);
    setList(n.data.data);
    setWa(s.data.data);
    setCampaigns(c.data.data);
  }, []);
  useEffect(() => { load().catch(() => toast.error('Failed to load')); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/notifications', { ...form, activeUntil: form.activeUntil || undefined, link: form.link || undefined });
      toast.success('Notification published on the website');
      setForm({ title: '', body: '', link: '', type: 'offer', activeUntil: '' });
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    try { await api.delete(`/admin/notifications/${id}`); load(); } catch (err) { toast.error(errMsg(err)); }
  };

  const campaign = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Record a WhatsApp campaign with template "${template}"? Only opted-in customers are eligible.`)) return;
    try {
      const { data } = await api.post('/admin/campaigns/whatsapp', { templateName: template });
      toast(data.data.status === 'BLOCKED' ? `Recorded but not sent: ${data.data.statusReason}` : 'Campaign sent');
      setTemplate('');
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="adm-page">
      <div className="adm-header"><div><h1 className="adm-title">Notifications & Campaigns</h1></div></div>

      <div className="adm-card">
        <h2>Website notification</h2>
        <p className="adm-sub">Shown to every logged-in customer in their notification bell (offers, new coupon codes, launches).</p>
        <form className="adm-form" onSubmit={send}>
          <label>Title<input className="form-input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Type<select className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['offer', 'coupon', 'launch', 'update'].map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Link (/products… or https://)<input className="form-input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></label>
          <label>Show until (optional)<input className="form-input" type="datetime-local" value={form.activeUntil} onChange={(e) => setForm({ ...form, activeUntil: e.target.value })} /></label>
          <label className="full">Message<textarea className="form-input" rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
          <div><button className="btn btn-primary adm-btn-sm" disabled={busy}>Publish</button></div>
        </form>
        <ul className="adm-timeline" style={{ marginTop: 14 }}>
          {list.map((n) => (
            <li key={n._id}><time>{fmtDate(n.createdAt)}</time><span><strong>{n.title}</strong> {n.body} <button className="btn btn-ghost adm-btn-sm adm-danger" onClick={() => del(n._id)}>Remove</button></span></li>
          ))}
        </ul>
      </div>

      <div className="adm-card">
        <h2>WhatsApp offers</h2>
        {wa && (
          <div className="adm-note">
            Status: <strong>{wa.enabled ? 'enabled' : 'not active'}</strong> — {wa.reason} · Opted-in customers: <strong>{wa.optedInCustomers}</strong>
          </div>
        )}
        <form className="adm-form" onSubmit={campaign} style={{ marginTop: 12 }}>
          <label>Approved template name<input className="form-input" required pattern="[a-z0-9_]{3,100}" title="lowercase letters, digits and _" value={template} onChange={(e) => setTemplate(e.target.value)} /></label>
          <div><button className="btn btn-outline adm-btn-sm">Record campaign</button></div>
        </form>
        <ul className="adm-timeline" style={{ marginTop: 14 }}>
          {campaigns.map((c) => (
            <li key={c._id}><time>{fmtDate(c.createdAt)}</time><span>{c.templateName} · <span className="adm-pill">{c.status}</span> · eligible {c.eligibleCount}, no consent {c.suppressedCount}{c.statusReason ? ` · ${c.statusReason}` : ''}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
