import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import '../pages/AuthPage.css';

/** Admin-only sign in. Customer accounts are refused here. */
export default function AdminLoginPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Email and password are required'); return; }
    setLoading(true);
    setError('');
    try {
      const u = await login(form.email, form.password);
      if (u.role !== 'admin') {
        await logout();
        setError('This account does not have admin access.');
        return;
      }
      toast.success('Signed in');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page admin-auth">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo display">🏺</span>
          <h1 className="auth-title display">Charu Pottery Admin</h1>
          <p className="auth-sub">Staff sign in</p>
        </div>
        <form onSubmit={submit} className="auth-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" autoComplete="username" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" className="form-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
