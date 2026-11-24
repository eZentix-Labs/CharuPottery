import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { fmtDate, errMsg, Pager } from './adminUi';

const EMPTY = { name: '', category: 'Packaging', unit: 'pcs', sku: '', stock: 0, lowStockThreshold: 10, notes: '', supplierName: '', supplierContact: '' };

/**
 * Inventory (CP-ADMIN-020/021): finished-product stock, packaging material
 * and any additional stock sections. All changes are ledgered adjustments
 * with a reason; stock can never go negative.
 */
export default function AdminInventoryPage() {
  const [tab, setTab] = useState('products');
  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Inventory</h1>
          <p className="adm-sub">Every change is recorded in the stock ledger with who, when and why.</p>
        </div>
      </div>
      <div className="adm-toolbar" role="tablist">
        {[['products', 'Finished products'], ['materials', 'Packaging & other stock'], ['ledger', 'Stock ledger']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? 'btn-primary' : 'btn-outline'} adm-btn-sm`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'products' && <ProductStock />}
      {tab === 'materials' && <Materials />}
      {tab === 'ledger' && <Ledger />}
    </div>
  );
}

function AdjustForm({ onSubmit, busy }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form className="adm-actions" onSubmit={(e) => { e.preventDefault(); onSubmit(Number(delta), reason, () => { setDelta(''); setReason(''); }); }}>
      <input className="form-input" style={{ width: 80 }} type="number" step="1" placeholder="±qty" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="Adjustment quantity" required />
      <input className="form-input" style={{ width: 170 }} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Adjustment reason" required minLength={3} />
      <button className="btn btn-outline adm-btn-sm" disabled={busy}>Apply</button>
    </form>
  );
}

function ProductStock() {
  const [rows, setRows] = useState([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/products/admin/all', { params: { page, limit: 25, q: q || undefined, lowStock: lowOnly ? 'true' : undefined, status: 'active' } });
    setRows(data.data);
    setPages(data.pages);
  }, [page, q, lowOnly]);
  useEffect(() => { load().catch(() => toast.error('Failed to load products')); }, [load]);

  const adjust = async (id, delta, reason, reset) => {
    setBusy(true);
    try { await api.post(`/products/${id}/stock-adjustments`, { delta, reason }); toast.success('Stock adjusted'); reset(); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="adm-toolbar">
        <input className="form-input" placeholder="Search product or SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label className="adm-check"><input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(1); }} /> Low stock only</label>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Available</th><th>Reserved (unpaid online)</th><th>Sold</th><th>Alert at</th><th>Adjust</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td className="mono">{p.sku}</td>
                <td><span className={`adm-pill ${p.stock <= p.lowStockThreshold ? 'warn' : 'ok'}`}>{p.stock}</span></td>
                <td>{p.reservedStock || 0}</td>
                <td>{p.soldCount}</td>
                <td>{p.lowStockThreshold}</td>
                <td><AdjustForm busy={busy} onSubmit={(d, r, reset) => adjust(p._id, d, r, reset)} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="adm-empty">No products</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
    </>
  );
}

function Materials() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/inventory/items', { params: { category: category || undefined } });
    setItems(data.data);
    setCategories(data.categories);
  }, [category]);
  useEffect(() => { load().catch(() => toast.error('Failed to load inventory')); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/inventory/items', {
        name: form.name, category: form.category, unit: form.unit, sku: form.sku || undefined, stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold), notes: form.notes, supplier: { name: form.supplierName, contact: form.supplierContact },
      });
      toast.success('Item added');
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const adjust = async (id, delta, reason, reset) => {
    setBusy(true);
    try { await api.post(`/admin/inventory/items/${id}/adjust`, { delta, reason }); toast.success('Stock adjusted'); reset(); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="adm-card">
        <h2>Add stock item</h2>
        <form className="adm-form" onSubmit={create}>
          <label>Name<input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Section (e.g. Packaging, Raw clay, Glazes)
            <input className="form-input" list="inv-cats" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <datalist id="inv-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label>Unit<input className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
          <label>Opening stock<input className="form-input" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
          <label>Low-stock alert at<input className="form-input" type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /></label>
          <label>SKU (optional)<input className="form-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
          <label>Supplier<input className="form-input" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></label>
          <label>Supplier contact<input className="form-input" value={form.supplierContact} onChange={(e) => setForm({ ...form, supplierContact: e.target.value })} /></label>
          <div><button className="btn btn-primary adm-btn-sm" disabled={busy}>Add item</button></div>
        </form>
      </div>
      <div className="adm-toolbar">
        <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Section">
          <option value="">All sections</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Item</th><th>Section</th><th>Stock</th><th>Alert at</th><th>Supplier</th><th>Adjust</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._id}>
                <td>{it.name}{it.sku && <><br /><span className="adm-sub mono">{it.sku}</span></>}</td>
                <td>{it.category}</td>
                <td><span className={`adm-pill ${it.stock <= it.lowStockThreshold ? 'warn' : 'ok'}`}>{it.stock} {it.unit}</span></td>
                <td>{it.lowStockThreshold}</td>
                <td>{it.supplier?.name || '—'}</td>
                <td><AdjustForm busy={busy} onSubmit={(d, r, reset) => adjust(it._id, d, r, reset)} /></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="adm-empty">No stock items yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Ledger() {
  const [rows, setRows] = useState([]);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    api.get('/admin/inventory/movements', { params: { page, type: type || undefined } })
      .then(({ data }) => { setRows(data.data); setPages(data.pages); })
      .catch(() => toast.error('Failed to load ledger'));
  }, [page, type]);
  return (
    <>
      <div className="adm-toolbar">
        <select className="form-input" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Movement type">
          <option value="">All movement types</option>
          {['INITIAL', 'RESERVE', 'RELEASE', 'COMMIT', 'SALE', 'RETURN_TO_STOCK', 'ADJUSTMENT'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>When</th><th>Item</th><th>Type</th><th>Qty</th><th>Available after</th><th>Order</th><th>By</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m._id}>
                <td>{fmtDate(m.createdAt)}</td>
                <td>{m.item?.name || '—'}</td>
                <td><span className="adm-pill">{m.type}</span></td>
                <td>{m.availableDelta > 0 ? `+${m.availableDelta}` : m.availableDelta || `(${m.quantity})`}</td>
                <td>{m.availableAfter}</td>
                <td className="mono">{m.order?.orderNumber || ''}</td>
                <td>{m.actor?.name || (m.actorRole === 'user' ? 'customer' : 'system')}</td>
                <td>{m.reason}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="adm-empty">No movements</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
    </>
  );
}
