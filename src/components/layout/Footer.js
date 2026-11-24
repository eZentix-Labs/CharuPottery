import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiInstagram, FiFacebook, FiYoutube, FiTwitter, FiSend, FiLinkedin, FiMessageCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PotMark } from './Navbar';
import useBrand from '../../hooks/useBrand';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const SOCIAL_ICONS = { instagram: FiInstagram, facebook: FiFacebook, youtube: FiYoutube, x: FiTwitter, linkedin: FiLinkedin, whatsapp: FiMessageCircle };
import './Footer.css';

export default function Footer() {
  const [email, setEmail] = useState('');
  const brand = useBrand();
  const { user } = useAuth();
  const navigate = useNavigate();
  const socials = Object.entries(brand?.social || {}).filter(([, url]) => url);

  // Real opt-in only: logged-in customers record email consent on their
  // account; visitors are sent to registration (nothing is stored silently).
  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!user) { navigate('/register', { state: { email } }); return; }
    try {
      await api.put('/account/consent', { email: true });
      toast.success('You will receive our updates by email. You can opt out from your profile.');
      setEmail('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save your preference');
    }
  };

  return (
    <footer className="footer" id="contact">
      <div className="village-divider light" style={{ marginTop: 28 }} aria-hidden="true" />
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">
            <PotMark size={30} />
            <span className="footer-logo-stack">
              <span className="footer-logo-text display">CHARU</span>
              <span className="footer-logo-tag">Handcrafted Pottery</span>
            </span>
          </span>
          <p className="footer-tagline">
            {brand?.tagline || 'Crafting handmade clay art for over two decades. Every piece carries the soul of Indian pottery traditions, shaped by experienced hands.'}
          </p>
          {socials.length > 0 && (
            <div className="footer-social">
              {socials.map(([k, url]) => {
                const Icon = SOCIAL_ICONS[k] || FiSend;
                return <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Charu Pottery on ${k}`}><Icon size={17} /></a>;
              })}
            </div>
          )}
        </div>

        <div className="footer-links-group">
          <h4 className="footer-heading">Company</h4>
          <ul>
            <li><Link to="/products">Shop All</Link></li>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/contact">Contact & Workshop</Link></li>
          </ul>
        </div>

        <div className="footer-links-group">
          <h4 className="footer-heading">Collections</h4>
          <ul>
            <li><Link to="/products?isNewArrival=true">New Arrivals</Link></li>
            <li><Link to="/products?isFeatured=true">Bestsellers</Link></li>
            <li><Link to="/products?clayType=Terracotta">Terracotta</Link></li>
            <li><Link to="/products?clayType=Stoneware">Stoneware</Link></li>
          </ul>
        </div>

        <div className="footer-links-group">
          <h4 className="footer-heading">Support</h4>
          <ul>
            <li><Link to="/my-orders">My Orders</Link></li>
            <li><Link to="/wishlist">Wishlist</Link></li>
            <li><span>Shipping calculated at checkout</span></li>
            <li><span>Cash on Delivery available</span></li>
          </ul>
        </div>

        <div className="footer-links-group footer-newsletter">
          <h4 className="footer-heading">Newsletter</h4>
          <p>Stories from the workshop, new collections & artisan offers{user ? '' : ' — create an account to subscribe'}.</p>
          <form className="newsletter-form" onSubmit={handleSubscribe}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={user ? user.email : 'Your email address'}
              aria-label="Email address"
              required={!user}
            />
            <button type="submit" aria-label="Subscribe"><FiSend size={16} /></button>
          </form>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <p>© {new Date().getFullYear()} CHARU. All rights reserved.</p>
          <div className="footer-payments">
            <span>Cash on Delivery</span>
          </div>
          <p className="made-in-india">Handmade in India 🇮🇳</p>
        </div>
      </div>
    </footer>
  );
}
