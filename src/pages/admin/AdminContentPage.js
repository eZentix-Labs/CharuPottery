import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { errMsg } from './adminUi';

const SOCIAL = ['instagram', 'facebook', 'youtube', 'whatsapp', 'pinterest', 'x', 'linkedin'];
const blankBrand = { tagline: '', about: '', story: '', founders: [], workshop: {}, social: {}, socialPosts: [], weeklyUpdates: [] };

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const { data } = await api.post('/content/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data.url;
}

/** Brand content (about, founders, workshop, social) and homepage banners. */
export default function AdminContentPage() {
  const [tab, setTab] = useState('brand');
  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Brand & Banners</h1>
          <p className="adm-sub">Content shown on the storefront home, About and footer. Use real client content before launch (DEC-13).</p>
        </div>
      </div>
      <div className="adm-toolbar" role="tablist">
        {[['brand', 'Brand story & founders'], ['social', 'Social & weekly updates'], ['banners', 'Homepage banners']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? 'btn-primary' : 'btn-outline'} adm-btn-sm`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'banners' ? <Banners /> : <BrandEditor section={tab} />}
    </div>
  );
}

function BrandEditor({ section }) {
  const [b, setB] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/content/brand').then(({ data }) => setB({ ...blankBrand, ...data.data })).catch(() => toast.error('Failed to load content')); }, []);
  if (!b) return <div className="spinner" />;

  const set = (k, v) => setB((p) => ({ ...p, [k]: v }));
  const setIn = (k, sub, v) => setB((p) => ({ ...p, [k]: { ...(p[k] || {}), [sub]: v } }));
  const setArr = (k, i, field, v) => setB((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? { ...x, [field]: v } : x)) }));
  const add = (k, item) => setB((p) => ({ ...p, [k]: [...(p[k] || []), item] }));
  const remove = (k, i) => setB((p) => ({ ...p, [k]: p[k].filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put('/content/brand', b); setB({ ...blankBrand, ...data.data }); toast.success('Saved'); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="adm-page">
      {section === 'brand' && (
        <>
          <div className="adm-card">
            <h2>Brand story</h2>
            <div className="adm-form">
              <label className="full">Tagline<input className="form-input" value={b.tagline} onChange={(e) => set('tagline', e.target.value)} /></label>
              <label className="full">About us<textarea className="form-input" rows={4} value={b.about} onChange={(e) => set('about', e.target.value)} /></label>
              <label className="full">Our story<textarea className="form-input" rows={6} value={b.story} onChange={(e) => set('story', e.target.value)} /></label>
            </div>
          </div>
          <div className="adm-card">
            <h2>Founders</h2>
            {b.founders.map((f, i) => (
              <div key={i} className="adm-form" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--parchment)' }}>
                <label>Name<input className="form-input" value={f.name} onChange={(e) => setArr('founders', i, 'name', e.target.value)} /></label>
                <label>Role<input className="form-input" placeholder="Founder / Co-Founder" value={f.role} onChange={(e) => setArr('founders', i, 'role', e.target.value)} /></label>
                <label>Photo
                  <input className="form-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => { if (e.target.files[0]) { try { setArr('founders', i, 'photo', await uploadImage(e.target.files[0])); } catch (err) { toast.error(errMsg(err)); } } }} />
                </label>
                {f.photo && <img src={f.photo} alt="" style={{ width: 64, height: 64, borderRadius: '50%' }} />}
                <label className="full">Bio<textarea className="form-input" rows={3} value={f.bio} onChange={(e) => setArr('founders', i, 'bio', e.target.value)} /></label>
                <div><button type="button" className="btn btn-ghost adm-btn-sm adm-danger" onClick={() => remove('founders', i)}>Remove</button></div>
              </div>
            ))}
            <button type="button" className="btn btn-outline adm-btn-sm" onClick={() => add('founders', { name: '', role: '', bio: '', photo: '' })}>Add founder</button>
          </div>
          <div className="adm-card">
            <h2>Workshop</h2>
            <div className="adm-form">
              {['name', 'address', 'city', 'hours', 'phone', 'email'].map((k) => (
                <label key={k}>{k[0].toUpperCase() + k.slice(1)}<input className="form-input" value={b.workshop?.[k] || ''} onChange={(e) => setIn('workshop', k, e.target.value)} /></label>
              ))}
              <label className="full">Google Maps link (https://)<input className="form-input" value={b.workshop?.mapUrl || ''} onChange={(e) => setIn('workshop', 'mapUrl', e.target.value)} /></label>
              <label className="full">Visiting information<textarea className="form-input" rows={3} value={b.workshop?.visitingInfo || ''} onChange={(e) => setIn('workshop', 'visitingInfo', e.target.value)} /></label>
            </div>
          </div>
        </>
      )}
      {section === 'social' && (
        <>
          <div className="adm-card">
            <h2>Social media links</h2>
            <div className="adm-form">
              {SOCIAL.map((k) => <label key={k}>{k}<input className="form-input" placeholder="https://" value={b.social?.[k] || ''} onChange={(e) => setIn('social', k, e.target.value)} /></label>)}
            </div>
          </div>
          <div className="adm-card">
            <h2>Featured posts & reels</h2>
            <p className="adm-sub">Paste links to your own posts. (Automatic fetching needs an Instagram Business account and Meta app — DEC-09.)</p>
            {b.socialPosts.map((s, i) => (
              <div key={i} className="adm-form" style={{ marginBottom: 10 }}>
                <label>Platform<select className="form-input" value={s.platform} onChange={(e) => setArr('socialPosts', i, 'platform', e.target.value)}>{['instagram', 'facebook', 'youtube', 'other'].map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>Post URL<input className="form-input" value={s.url} onChange={(e) => setArr('socialPosts', i, 'url', e.target.value)} /></label>
                <label>Caption<input className="form-input" value={s.caption} onChange={(e) => setArr('socialPosts', i, 'caption', e.target.value)} /></label>
                <label>Thumbnail
                  <input className="form-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => { if (e.target.files[0]) { try { setArr('socialPosts', i, 'thumbnail', await uploadImage(e.target.files[0])); } catch (err) { toast.error(errMsg(err)); } } }} />
                </label>
                <div><button type="button" className="btn btn-ghost adm-btn-sm adm-danger" onClick={() => remove('socialPosts', i)}>Remove</button></div>
              </div>
            ))}
            <button type="button" className="btn btn-outline adm-btn-sm" onClick={() => add('socialPosts', { platform: 'instagram', url: '', caption: '', thumbnail: '' })}>Add post</button>
          </div>
          <div className="adm-card">
            <h2>Weekly updates & new launches</h2>
            {b.weeklyUpdates.map((u, i) => (
              <div key={i} className="adm-form" style={{ marginBottom: 10 }}>
                <label>Title<input className="form-input" value={u.title} onChange={(e) => setArr('weeklyUpdates', i, 'title', e.target.value)} /></label>
                <label>Date<input className="form-input" type="date" value={u.date ? String(u.date).slice(0, 10) : ''} onChange={(e) => setArr('weeklyUpdates', i, 'date', e.target.value)} /></label>
                <label>Link (optional, /products/… or https://)<input className="form-input" value={u.link || ''} onChange={(e) => setArr('weeklyUpdates', i, 'link', e.target.value)} /></label>
                <label className="full">Text<textarea className="form-input" rows={2} value={u.body} onChange={(e) => setArr('weeklyUpdates', i, 'body', e.target.value)} /></label>
                <div><button type="button" className="btn btn-ghost adm-btn-sm adm-danger" onClick={() => remove('weeklyUpdates', i)}>Remove</button></div>
              </div>
            ))}
            <button type="button" className="btn btn-outline adm-btn-sm" onClick={() => add('weeklyUpdates', { title: '', body: '', date: new Date().toISOString().slice(0, 10), link: '' })}>Add update</button>
          </div>
        </>
      )}
      <div><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save content'}</button></div>
    </div>
  );
}

const EMPTY_BANNER = { title: '', subtitle: '', link: '', ctaLabel: '', placement: 'home_hero', sortOrder: 0, isActive: true, startsAt: '', endsAt: '', image: null };

function Banners() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY_BANNER);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/content/admin/banners').then(({ data }) => setRows(data.data)).catch(() => toast.error('Failed to load banners')), []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.image?.url) { toast.error('Please upload a banner image'); return; }
    setBusy(true);
    try {
      const body = { ...form, startsAt: form.startsAt || null, endsAt: form.endsAt || null };
      if (editing) await api.put(`/content/admin/banners/${editing}`, body);
      else await api.post('/content/admin/banners', body);
      toast.success('Banner saved');
      setForm(EMPTY_BANNER);
      setEditing(null);
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    try { await api.delete(`/content/admin/banners/${id}`); load(); } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="adm-page">
      <div className="adm-card">
        <h2>{editing ? 'Edit banner' : 'New banner'}</h2>
        <form className="adm-form" onSubmit={submit}>
          <label>Title<input className="form-input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Subtitle<input className="form-input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></label>
          <label>Button text<input className="form-input" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} /></label>
          <label>Link (/products?… or https://)<input className="form-input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></label>
          <label>Placement<select className="form-input" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}><option value="home_hero">Home carousel</option><option value="home_offer">Home offer strip</option></select></label>
          <label>Order<input className="form-input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
          <label>Show from<input className="form-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label>Show until<input className="form-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label>Image (wide, JPG/PNG/WEBP)
            <input className="form-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => { if (e.target.files[0]) { try { setForm({ ...form, image: { url: await uploadImage(e.target.files[0]), altText: form.title } }); } catch (err) { toast.error(errMsg(err)); } } }} />
          </label>
          {form.image?.url && <img src={form.image.url} alt="" style={{ width: 200, height: 70, borderRadius: 8 }} />}
          <label className="adm-check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          <div className="adm-actions">
            <button className="btn btn-primary adm-btn-sm" disabled={busy}>{editing ? 'Update' : 'Add banner'}</button>
            {editing && <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => { setEditing(null); setForm(EMPTY_BANNER); }}>Cancel</button>}
          </div>
        </form>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Image</th><th>Title</th><th>Placement</th><th>Order</th><th>Active</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td><img src={r.image?.url} alt="" style={{ width: 120, height: 44, borderRadius: 6 }} /></td>
                <td>{r.title}<br /><span className="adm-sub">{r.subtitle}</span></td>
                <td>{r.placement}</td>
                <td>{r.sortOrder}</td>
                <td>{r.isActive ? 'Yes' : 'No'}</td>
                <td className="adm-actions">
                  <button className="btn btn-ghost adm-btn-sm" onClick={() => { setEditing(r._id); setForm({ ...EMPTY_BANNER, ...r, startsAt: r.startsAt ? r.startsAt.slice(0, 16) : '', endsAt: r.endsAt ? r.endsAt.slice(0, 16) : '' }); }}>Edit</button>
                  <button className="btn btn-ghost adm-btn-sm adm-danger" onClick={() => del(r._id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="adm-empty">No banners yet — the homepage shows the default hero.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
