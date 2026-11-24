import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/layout/AdminLayout';
import AdminLoginPage from './AdminLoginPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminProductsPage from '../pages/admin/AdminProductsPage';
import AdminProductFormPage from '../pages/admin/AdminProductFormPage';
import AdminOrdersPage from '../pages/admin/AdminOrdersPage';
import AdminOrderDetailPage from '../pages/admin/AdminOrderDetailPage';
import AdminInventoryPage from '../pages/admin/AdminInventoryPage';
import AdminCustomersPage from '../pages/admin/AdminCustomersPage';
import AdminCouponsPage from '../pages/admin/AdminCouponsPage';
import AdminReviewsPage from '../pages/admin/AdminReviewsPage';
import AdminContentPage from '../pages/admin/AdminContentPage';
import AdminMarketingPage from '../pages/admin/AdminMarketingPage';
import '../pages/admin/admin-common.css';

/**
 * The admin application (CP-XCUT-003: "The customer panel and the admin panel
 * wants differently"). It is loaded as a separate JavaScript bundle, has its
 * own login, layout and navigation, and never renders storefront chrome.
 * Every action is also authorised on the server.
 */
function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (!user || user.role !== 'admin') return <Navigate to="/admin/login" replace />;
  return children;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/:id" element={<AdminOrderDetailPage />} />
        <Route path="products" element={<AdminProductsPage />} />
        <Route path="products/new" element={<AdminProductFormPage />} />
        <Route path="products/:id/edit" element={<AdminProductFormPage />} />
        <Route path="inventory" element={<AdminInventoryPage />} />
        <Route path="customers" element={<AdminCustomersPage />} />
        <Route path="coupons" element={<AdminCouponsPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="marketing" element={<AdminMarketingPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
