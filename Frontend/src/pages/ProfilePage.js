import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiUser, FiLock, FiMapPin, FiPlus, FiTrash2, FiCamera, FiGift, FiBell, FiSliders } from 'react-icons/fi';
import './ProfilePage.css';

const TABS = ['Profile', 'Addresses', 'Prime Collection', 'Notifications', 'Preferences', 'Password'];
const TAB_ICON = { Profile: FiUser, Addresses: FiMapPin, Password: FiLock, 'Prime Collection': FiGift, Notifications: FiBell, Preferences: FiSliders };

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState(TABS.includes(location.state?.tab) ? location.state.tab : 'Profile');
  const [saving, setSaving] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' });

  // Password form
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdErrors, setPwdErrors] = useState({});

  // Address form
  const [addresses, setAddresses] = useState(user?.addresses || []);
  const [newAddr, setNewAddr] = useState({ label: 'Home', street: '', city: '', state: '', postalCode: '', country: 'India', phone: '' });
  const [showAddrForm, setShowAddrForm] = useState(false);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/auth/update-profile', profile);
      updateUser(data.data);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image is too large (max 3 MB)'); return; }
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const { data } = await api.post('/upload/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser(data.data);
      toast.success('Avatar updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      e.target.value = '';
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pwd.currentPassword) errs.currentPassword = 'Required';
    if (pwd.newPassword.length < 8 || !/[A-Za-z]/.test(pwd.newPassword) || !/[0-9]/.test(pwd.newPassword)) errs.newPassword = 'At least 8 characters, with a letter and a number';
    if (pwd.newPassword !== pwd.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (Object.keys(errs).length) { setPwdErrors(errs); return; }
    setSaving(true);
    try {
      const { data } = await api.put('/auth/update-password', { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
      // Other sessions are signed out; keep this one with the fresh token.
      if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
      toast.success('Password changed. Other devices have been signed out.');
      setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwdErrors({});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/auth/addresses', newAddr);
      setAddresses(data.data);
      updateUser({ addresses: data.data });
      setShowAddrForm(false);
      setNewAddr({ label: 'Home', street: '', city: '', state: '', postalCode: '', country: 'India', phone: '' });
      toast.success('Address added!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add address');
    } finally {
      setSaving(false);
    }
  };

  const handleMakeDefault = async (addressId) => {
    try {
      const { data } = await api.put(`/auth/addresses/${addressId}`, { isDefault: true });
      setAddresses(data.data);
      updateUser({ addresses: data.data });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update address');
    }
  };

  const handleDeleteAddress = async (addressId) => {
    try {
      const { data } = await api.delete(`/auth/addresses/${addressId}`);
      setAddresses(data.data);
      updateUser({ addresses: data.data });
      toast.success('Address removed');
    } catch {
      toast.error('Failed to remove address');
    }
  };

  return (
    <div className="profile-page">
      <div className="container">
        <h1 className="profile-title display">My Profile</h1>

        <div className="profile-layout">
          {/* Sidebar */}
          <aside className="profile-sidebar">
            <div className="profile-avatar-wrap">
              <img
                src={user?.avatar?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=C9875A&color=fff`}
                alt={user?.name}
                className="profile-avatar"
              />
              <label className="avatar-upload-btn" title="Change photo">
                <FiCamera size={14} />
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} style={{ display: 'none' }} aria-label="Change profile photo" />
              </label>
            </div>
            <p className="profile-name display">{user?.name}</p>
            <p className="profile-email">{user?.email}</p>
            <nav className="profile-nav">
              {TABS.map((t) => {
                const Icon = TAB_ICON[t];
                return (
                  <button key={t} className={`profile-nav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)} aria-current={tab === t}>
                    <Icon size={15} /> {t}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="profile-content">
            {/* Profile tab */}
            {tab === 'Profile' && (
              <div className="profile-card">
                <h2 className="profile-card-title">Personal Information</h2>
                <form onSubmit={handleProfileSave} className="profile-form">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input className="form-input" value={user?.email} disabled style={{ opacity: 0.6 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input className="form-input" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </form>
              </div>
            )}

            {/* Addresses tab */}
            {tab === 'Addresses' && (
              <div className="profile-card">
                <div className="profile-card-header">
                  <h2 className="profile-card-title">Saved Addresses</h2>
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: '8px 16px' }} onClick={() => setShowAddrForm(!showAddrForm)}>
                    <FiPlus size={14} /> Add New
                  </button>
                </div>

                {showAddrForm && (
                  <form onSubmit={handleAddAddress} className="addr-form">
                    <div className="addr-form-grid">
                      <div className="form-group">
                        <label className="form-label">Label</label>
                        <select className="form-input" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })}>
                          <option>Home</option><option>Work</option><option>Other</option>
                        </select>
                      </div>
                      <div className="form-group span2">
                        <label className="form-label">Street Address</label>
                        <input className="form-input" value={newAddr.street} onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input className="form-input" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <input className="form-input" value={newAddr.state} onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">PIN Code</label>
                        <input className="form-input" inputMode="numeric" pattern="[1-9][0-9]{5}" title="6-digit PIN code" value={newAddr.postalCode} onChange={(e) => setNewAddr({ ...newAddr, postalCode: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-input" type="tel" pattern="(\+91)?[6-9][0-9]{9}" title="10-digit mobile number" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} required />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Address'}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowAddrForm(false)}>Cancel</button>
                    </div>
                  </form>
                )}

                {addresses.length === 0 && !showAddrForm ? (
                  <p style={{ color: 'var(--stone-light)', fontSize: 14, marginTop: 16 }}>No saved addresses yet.</p>
                ) : (
                  <div className="addr-list">
                    {addresses.map((addr, i) => (
                      <div key={addr._id || i} className="addr-item">
                        <div>
                          <span className="addr-label-badge">{addr.label}</span>
                          {addr.isDefault ? <span className="addr-label-badge" style={{ marginLeft: 6 }}>Default</span> : (
                            <button className="btn btn-ghost" style={{ fontSize: 12, marginLeft: 6 }} onClick={() => handleMakeDefault(addr._id)}>Make default</button>
                          )}
                          <p className="addr-text">{addr.street}, {addr.city}, {addr.state} {addr.postalCode}</p>
                          <p className="addr-text">{addr.country} · {addr.phone}</p>
                        </div>
                        <button className="btn btn-ghost" style={{ color: 'var(--error)' }} onClick={() => handleDeleteAddress(addr._id)}>
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'Prime Collection' && <PrimeTab />}
            {tab === 'Notifications' && <NotificationsTab />}
            {tab === 'Preferences' && <PreferencesTab user={user} updateUser={updateUser} />}

            {/* Password tab */}
            {tab === 'Password' && (
              <div className="profile-card">
                <h2 className="profile-card-title">Change Password</h2>
                <form onSubmit={handlePasswordSave} className="profile-form">
                  {[
                    { key: 'currentPassword', label: 'Current Password' },
                    { key: 'newPassword', label: 'New Password' },
                    { key: 'confirmPassword', label: 'Confirm New Password' },
                  ].map(({ key, label }) => (
                    <div className="form-group" key={key}>
                      <label className="form-label">{label}</label>
                      <input
                        type="password"
                        className={`form-input${pwdErrors[key] ? ' error' : ''}`}
                        value={pwd[key]}
                        onChange={(e) => { setPwd({ ...pwd, [key]: e.target.value }); setPwdErrors({ ...pwdErrors, [key]: '' }); }}
                      />
                      {pwdErrors[key] && <span className="form-error">{pwdErrors[key]}</span>}
                    </div>
                  ))}
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update Password'}</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Prime Collection progress (CP-CUST-040) — counts come from the server. */
function PrimeTab() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/account/loyalty').then(({ data }) => setD(data.data)).catch(() => setError('Could not load your Prime Collection status.')); }, []);
  if (error) return <div className="profile-card"><p className="form-error">{error}</p></div>;
  if (!d) return <div className="profile-card"><div className="spinner" /></div>;
  const pct = Math.round((d.progressToNext / d.purchasesPerReward) * 100);
  return (
    <div className="profile-card">
      <h2 className="profile-card-title"><FiGift /> Prime Collection</h2>
      <p className="addr-text">After every {d.purchasesPerReward} completed purchases, your next order comes with a free handmade gift.</p>
      {d.rewardsAvailable > 0 ? (
        <div className="prime-available">🎁 You have {d.rewardsAvailable} reward{d.rewardsAvailable > 1 ? 's' : ''} ready! Tick “Use my Prime Collection reward” at checkout.</div>
      ) : (
        <>
          <div className="prime-bar" role="progressbar" aria-valuemin={0} aria-valuemax={d.purchasesPerReward} aria-valuenow={d.progressToNext} aria-label="Progress to next reward">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="addr-text">{d.progressToNext} of {d.purchasesPerReward} — {d.purchasesUntilNextReward} more completed purchase{d.purchasesUntilNextReward === 1 ? '' : 's'} to your next gift.</p>
        </>
      )}
      <p className="addr-text" style={{ marginTop: 12 }}>Completed purchases so far: {d.qualifyingPurchases} · Rewards used: {d.rewardsRedeemed}</p>
      <p className="review-date" style={{ marginTop: 8 }}>A purchase counts once it has been delivered and paid. Cancelled or refunded orders don't count.</p>
      {d.history?.length > 0 && (
        <ul className="addr-list" style={{ marginTop: 12 }}>
          {d.history.map((h) => (
            <li key={h._id} className="addr-text">{h.type === 'REDEEM' ? 'Reward used' : 'Reward returned'} · {h.order?.orderNumber} · {new Date(h.createdAt).toLocaleDateString('en-IN')}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationsTab() {
  const [rows, setRows] = useState(null);
  const load = () => api.get('/account/notifications').then(({ data }) => setRows(data.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const readAll = async () => { await api.post('/account/notifications/read-all'); load(); };
  if (!rows) return <div className="profile-card"><div className="spinner" /></div>;
  return (
    <div className="profile-card">
      <div className="profile-card-header">
        <h2 className="profile-card-title"><FiBell /> Notifications</h2>
        {rows.some((r) => !r.read) && <button className="btn btn-ghost" onClick={readAll}>Mark all read</button>}
      </div>
      {rows.length === 0 && <p className="addr-text">No notifications yet.</p>}
      <ul className="addr-list">
        {rows.map((n) => (
          <li key={n._id} className={`addr-item${n.read ? '' : ' unread'}`}>
            <div>
              <p style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</p>
              {n.body && <p className="addr-text">{n.body}</p>}
              <p className="review-date">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
            </div>
            {n.link && (n.link.startsWith('/') ? <Link to={n.link} className="btn btn-ghost">View</Link> : <a href={n.link} className="btn btn-ghost" rel="noopener noreferrer">View</a>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Marketing consent (DEC-07): explicit opt-in / opt-out, recorded with time. */
function PreferencesTab({ user, updateUser }) {
  const [consent, setConsent] = useState(user?.marketingConsent || {});
  const [saving, setSaving] = useState(false);
  const toggle = async (channel, value) => {
    setSaving(true);
    try {
      const { data } = await api.put('/account/consent', { [channel]: value });
      setConsent(data.data);
      updateUser({ marketingConsent: data.data });
      toast.success(value ? 'Subscribed' : 'Unsubscribed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update your preference');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="profile-card">
      <h2 className="profile-card-title"><FiSliders /> Offers & updates</h2>
      <p className="addr-text">Choose how you'd like to hear about new launches, weekly updates and coupon codes. You can change this at any time.</p>
      <label className="prime-consent">
        <input type="checkbox" checked={!!consent.whatsapp?.optedIn} disabled={saving} onChange={(e) => toggle('whatsapp', e.target.checked)} />
        <span>Send me offers on WhatsApp{user?.phone ? ` (${user.phone})` : ' — add a mobile number in Profile first'}</span>
      </label>
      <label className="prime-consent">
        <input type="checkbox" checked={!!consent.email?.optedIn} disabled={saving} onChange={(e) => toggle('email', e.target.checked)} />
        <span>Send me offers by email ({user?.email})</span>
      </label>
      <p className="review-date" style={{ marginTop: 8 }}>Order updates are always shown in your notifications, whatever you choose here.</p>
    </div>
  );
}
