import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../../api/axios';
import { fmtDate, errMsg, Pager } from './adminUi';

// Uploaded media is served by the backend at /uploads; resolve against the API host.
const mediaUrl = (u) => (u?.startsWith('/uploads') ? API_BASE_URL.replace(/\/api\/v1\/?$/, '') + u : u);

/** Review & customer-media moderation (CP-CUST-012/013, CP-ADMIN-012). */
export default function AdminReviewsPage() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async () => {
    const { data } = await api.get('/reviews/admin', { params: { status, page } });
    setRows(data.data);
    setPages(data.pages);
  }, [status, page]);
  useEffect(() => { load().catch(() => toast.error('Failed to load reviews')); }, [load]);

  const moderate = async (id, s) => {
    let note;
    if (s === 'rejected') { note = window.prompt('Reason for rejecting (internal note):') || undefined; }
    try { await api.patch(`/reviews/${id}/moderate`, { status: s, note }); toast.success(`Review ${s}`); load(); }
    catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Reviews</h1>
          <p className="adm-sub">New and edited reviews stay hidden until approved (policy DEC-10, pending client confirmation).</p>
        </div>
      </div>
      <div className="adm-toolbar" role="tablist">
        {['pending', 'reported', 'approved', 'rejected'].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={`btn ${status === s ? 'btn-primary' : 'btn-outline'} adm-btn-sm`} onClick={() => { setStatus(s); setPage(1); }}>{s}</button>
        ))}
      </div>
      {rows.length === 0 && <div className="adm-card adm-empty">Nothing here.</div>}
      {rows.map((r) => (
        <div key={r._id} className="adm-card">
          <h2>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} {r.title}</h2>
          <p style={{ fontSize: 14 }}>{r.comment}</p>
          {r.media?.length > 0 && (
            <div className="adm-actions" style={{ marginTop: 10 }}>
              {r.media.map((m) => (m.kind === 'video'
                ? <video key={m.url} src={mediaUrl(m.url)} controls preload="metadata" style={{ width: 200, borderRadius: 8 }} />
                : <img key={m.url} src={mediaUrl(m.url)} alt="Customer upload" style={{ width: 120, height: 120, borderRadius: 8 }} />))}
            </div>
          )}
          <p className="adm-sub" style={{ marginTop: 8 }}>
            {r.user?.name} ({r.user?.email}) · {r.product?.name} · {fmtDate(r.createdAt)} · {r.isVerifiedPurchase ? 'verified purchase' : 'not a verified purchase'} · status: {r.status || 'approved (legacy)'}
          </p>
          {r.reportCount > 0 && <div className="adm-note">Reported {r.reportCount}×: {r.reports.map((x) => x.reason).join('; ')}</div>}
          <div className="adm-actions" style={{ marginTop: 10 }}>
            {r.status !== 'approved' && <button className="btn btn-primary adm-btn-sm" onClick={() => moderate(r._id, 'approved')}>Approve</button>}
            {r.status !== 'rejected' && <button className="btn btn-outline adm-btn-sm adm-danger" onClick={() => moderate(r._id, 'rejected')}>Reject</button>}
          </div>
        </div>
      ))}
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  );
}
