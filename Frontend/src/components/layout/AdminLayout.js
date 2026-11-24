import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiGrid, FiPackage, FiShoppingBag, FiLogOut, FiMenu, FiX, FiArchive, FiUsers, FiTag, FiStar, FiEdit3, FiBell, FiExternalLink } from 'react-icons/fi';
import './AdminLayout.css';

const navItems = [
  { to: '/admin', label: 'Dashboard', Icon: FiGrid, end: true },
  { to: '/admin/orders', label: 'Orders', Icon: FiPackage },
  { to: '/admin/products', label: 'Products', Icon: FiShoppingBag },
  { to: '/admin/inventory', label: 'Inventory', Icon: FiArchive },
  { to: '/admin/customers', label: 'Customers', Icon: FiUsers },
  { to: '/admin/coupons', label: 'Coupons & Offers', Icon: FiTag },
  { to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
  { to: '/admin/content', label: 'Brand & Banners', Icon: FiEdit3 },
  { to: '/admin/marketing', label: 'Notifications', Icon: FiBell },
];

// Link to the customer storefront (separate app/deployment when configured).
const STOREFRONT_URL = process.env.REACT_APP_STOREFRONT_URL || '/';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 900));

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className={`admin-layout${sidebarOpen ? '' : ' collapsed'}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo display">🏺 Charu Admin</span>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="sidebar-toggle" aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}>
            {sidebarOpen ? <FiX size={18} /> : <FiMenu size={18} />}
          </button>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={18} />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {sidebarOpen && <p className="sidebar-user">{user?.name}</p>}
          <a href={STOREFRONT_URL} className="sidebar-link" target="_blank" rel="noopener noreferrer">
            <FiExternalLink size={18} />
            {sidebarOpen && <span>View store</span>}
          </a>
          <button onClick={handleLogout} className="sidebar-link logout">
            <FiLogOut size={18} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
