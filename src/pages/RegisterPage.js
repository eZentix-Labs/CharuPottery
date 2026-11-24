import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './AuthPage.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: location.state?.email || '', phone: '', password: '', confirm: '', whatsappOptIn: false });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email) e.email = 'Email is required';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) e.password = 'At least 8 characters, including a letter and a number';
    if (form.phone && !/^(\+91)?[6-9][0-9]{9}$/.test(form.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid 10-digit mobile number';
    if (form.whatsappOptIn && !form.phone) e.phone = 'Add your mobile number to receive WhatsApp offers';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const user = await register(form.name, form.email, form.password, {
        phone: form.phone ? form.phone.replace(/[\s-]/g, '') : undefined,
        whatsappOptIn: form.whatsappOptIn === true,
      });
      toast.success(`Welcome, ${user.name}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const set = (key, val) => { setForm({ ...form, [key]: val }); setErrors({ ...errors, [key]: '' }); };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo display">🏺</span>
          <h1 className="auth-title display">Create account</h1>
          <p className="auth-sub">Join CHARU — discover handcrafted Indian pottery</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input type="text" className={`form-input${errors.name ? ' error' : ''}`} placeholder="Priya Sharma" value={form.name} onChange={(e) => set('name', e.target.value)} />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className={`form-input${errors.email ? ' error' : ''}`} placeholder="priya@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className={`form-input${errors.password ? ' error' : ''}`} placeholder="Min. 8 characters, letter + number" value={form.password} onChange={(e) => set('password', e.target.value)} />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Mobile (optional)</label>
            <input id="reg-phone" type="tel" className={`form-input${errors.phone ? ' error' : ''}`} placeholder="10-digit mobile number" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            {errors.phone && <span className="form-error">{errors.phone}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input type="password" className={`form-input${errors.confirm ? ' error' : ''}`} placeholder="Repeat password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
            {errors.confirm && <span className="form-error">{errors.confirm}</span>}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="checkbox" checked={form.whatsappOptIn} onChange={(e) => set('whatsappOptIn', e.target.checked)} />
            <span>Yes, send me offers and new coupon codes on WhatsApp. I can unsubscribe any time from my profile.</span>
          </label>
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
