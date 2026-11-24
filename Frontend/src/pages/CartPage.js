import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatPaise } from '../utils/money';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';
import { FiTrash2, FiPlus, FiMinus, FiShoppingBag, FiArrowRight } from 'react-icons/fi';
import './CartPage.css';

export default function CartPage() {
  const { cart, cartLoading, updateCartItem, removeFromCart, clearCart, cartChanges } = useCart();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);

  const items = cart?.items || [];

  // Totals always come from the server (current prices, tax, shipping).
  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    api.get('/orders/checkout/quote').then(({ data }) => setQuote(data.data)).catch(() => setQuote(null));
  }, [cart]);

  const handleQty = async (productId, qty) => {
    if (qty < 1) return;
    try { await updateCartItem(productId, qty); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to update'); }
  };

  const handleRemove = async (productId) => {
    try { await removeFromCart(productId); toast.success('Item removed'); }
    catch { toast.error('Failed to remove'); }
  };

  const handleClear = async () => {
    try { await clearCart(); toast.success('Cart cleared'); }
    catch { toast.error('Failed to clear cart'); }
  };


  if (cartLoading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div className="cart-page">
      <div className="container">
        <h1 className="cart-title display">Your Cart</h1>
        {cartChanges?.length > 0 && (
          <div className="cart-changes" role="status">
            {cartChanges.map((c) => (
              <p key={`${c.productId}-${c.type}`}>
                {c.type === 'PRICE_CHANGED' && <>The price of <strong>{c.name}</strong> changed from ₹{c.oldPrice.toLocaleString('en-IN')} to ₹{c.newPrice.toLocaleString('en-IN')}.</>}
                {c.type === 'UNAVAILABLE' && <><strong>{c.name}</strong> is no longer available — please remove it.</>}
                {c.type === 'LOW_STOCK' && <>Only {c.available} of <strong>{c.name}</strong> left — please reduce the quantity.</>}
              </p>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <div className="cart-empty">
            <FiShoppingBag size={56} color="var(--stone-light)" />
            <h2 className="display" style={{ fontSize: 28, marginTop: 16 }}>Your cart is empty</h2>
            <p style={{ color: 'var(--stone-light)', marginTop: 8 }}>Discover handcrafted pottery worth bringing home.</p>
            <Link to="/products" className="btn btn-primary" style={{ marginTop: 24 }}>Shop Now</Link>
          </div>
        ) : (
          <div className="cart-layout">
            {/* Items */}
            <div className="cart-items">
              <div className="cart-items-header">
                <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={handleClear}>
                  <FiTrash2 size={13} /> Clear all
                </button>
              </div>

              {items.map((item) => (
                <div key={item.product} className="cart-item">
                  <Link to={`/products/${item.slug || item.product}`}>
                    <img src={item.image} alt={item.name} className="cart-item-img" />
                  </Link>
                  <div className="cart-item-info">
                    <Link to={`/products/${item.slug || item.product}`} className="cart-item-name display">{item.name}</Link>
                    <p className="cart-item-price">₹{item.price.toLocaleString('en-IN')} each</p>
                    <div className="cart-item-actions">
                      <div className="qty-control">
                        <button onClick={() => handleQty(item.product, item.quantity - 1)} disabled={item.quantity <= 1}><FiMinus size={14} /></button>
                        <span>{item.quantity}</span>
                        <button onClick={() => handleQty(item.product, item.quantity + 1)}><FiPlus size={14} /></button>
                      </div>
                      <button className="remove-btn" onClick={() => handleRemove(item.product)}><FiTrash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="cart-item-total">
                    ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="cart-summary">
              <h3 className="summary-title">Order Summary</h3>
              <div className="summary-rows">
                {!quote ? <div className="spinner" /> : (
                  <>
                    <div className="summary-row"><span>Subtotal</span><span>{formatPaise(quote.itemsPaise)}</span></div>
                    <div className="summary-row"><span>Tax ({quote.taxRateBasisPoints / 100}%)</span><span>{formatPaise(quote.taxPaise)}</span></div>
                    <div className="summary-row">
                      <span>Shipping</span>
                      <span>{quote.shippingPaise === 0 ? <span style={{ color: 'var(--success)' }}>Free</span> : formatPaise(quote.shippingPaise)}</span>
                    </div>
                    {quote.shippingPaise > 0 && quote.freeShippingAbovePaise > quote.itemsPaise && (
                      <p className="free-shipping-hint">Add {formatPaise(quote.freeShippingAbovePaise - quote.itemsPaise + 100)} more for free shipping</p>
                    )}
                    <hr className="divider" />
                    <div className="summary-row total"><span>Total</span><span>{formatPaise(quote.totalPaise)}</span></div>
                    {quote.problems?.length > 0 && <p className="form-error">{quote.problems[0].message}</p>}
                  </>
                )}
              </div>
              <button className="btn btn-primary checkout-btn" onClick={() => navigate('/checkout')} disabled={!quote || quote.problems?.length > 0}>
                Proceed to Checkout <FiArrowRight size={16} />
              </button>
              <Link to="/products" className="btn btn-ghost continue-btn">Continue Shopping</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
