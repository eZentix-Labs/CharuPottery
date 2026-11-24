import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

import Layout from './components/layout/Layout';

// Public pages
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ContactPage from './pages/ContactPage';
import CollectionsPage from './pages/CollectionsPage';
import AboutPage from './pages/AboutPage';

// Protected pages
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import MyOrdersPage from './pages/MyOrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ProfilePage from './pages/ProfilePage';
import WishlistPage from './pages/WishlistPage';

/**
 * Build targets (REACT_APP_APP_TARGET):
 *   all        (default) storefront at /, admin at /admin — one deployment
 *   storefront storefront only; /admin redirects to REACT_APP_ADMIN_URL
 *   admin      admin only; everything routes into /admin
 * The admin code is a separate lazily-loaded bundle, so storefront visitors
 * never download it; in a `storefront` build it is not emitted at all.
 */
const TARGET = process.env.REACT_APP_APP_TARGET || 'all';
const ADMIN_URL = process.env.REACT_APP_ADMIN_URL || '';
// The env expression is written inline so webpack can drop the admin chunk in a storefront build.
const AdminApp = process.env.REACT_APP_APP_TARGET !== 'storefront'
  ? lazy(() => import(/* webpackChunkName: "admin" */ './admin/AdminApp'))
  : null;

const Loader = () => <div className="page-loader"><div className="spinner" /></div>;

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return user ? children : <Navigate to="/login" replace />;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return !user ? children : <Navigate to="/" replace />;
}

function ExternalAdminRedirect() {
  if (ADMIN_URL) window.location.replace(ADMIN_URL);
  return <Navigate to="/" replace />;
}

function StorefrontRoutes() {
  return (
    <Route element={<Layout />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/:slug" element={<ProductDetailPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/collections" element={<CollectionsPage />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      <Route path="/cart" element={<PrivateRoute><CartPage /></PrivateRoute>} />
      <Route path="/checkout" element={<PrivateRoute><CheckoutPage /></PrivateRoute>} />
      <Route path="/order-success/:id" element={<PrivateRoute><OrderSuccessPage /></PrivateRoute>} />
      <Route path="/my-orders" element={<PrivateRoute><MyOrdersPage /></PrivateRoute>} />
      <Route path="/my-orders/:id" element={<PrivateRoute><OrderDetailPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/wishlist" element={<PrivateRoute><WishlistPage /></PrivateRoute>} />
    </Route>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              style: { fontFamily: 'Inter, sans-serif', fontSize: 14, background: '#FFFCF8', color: '#2A1E14', border: '1px solid #E7DACA' },
              success: { iconTheme: { primary: '#5F7A32', secondary: '#fff' } },
              error: { iconTheme: { primary: '#B3402A', secondary: '#fff' } },
            }}
          />
          <Suspense fallback={<Loader />}>
            <Routes>
              {TARGET !== 'admin' && StorefrontRoutes()}
              {AdminApp ? (
                <Route path="/admin/*" element={<AdminApp />} />
              ) : (
                <Route path="/admin/*" element={<ExternalAdminRedirect />} />
              )}
              <Route path="*" element={<Navigate to={TARGET === 'admin' ? '/admin' : '/'} replace />} />
            </Routes>
          </Suspense>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
