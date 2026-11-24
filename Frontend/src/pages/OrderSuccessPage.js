import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { FiCheckCircle, FiPackage, FiHome, FiClock, FiXCircle, FiGift } from 'react-icons/fi';
import { formatPaise, orderTotalPaise } from '../utils/money';
import { paymentLabel, statusLabel } from '../utils/orderStatus';
import { useCart } from '../context/CartContext';
import PrimeReveal from '../components/common/PrimeReveal';
import './OrderSuccessPage.css';

/**
 * Shown after checkout (COD) or after returning from the payment gateway.
 * It never claims success the server hasn't confirmed:
 *   - COD: "Order placed", payment pending until cash is collected.
 *   - Online: asks the server to verify with the gateway, then shows
 *     Paid / Processing / Failed honestly.
 */
export default function OrderSuccessPage() {
  const { id } = useParams();
  const { fetchCart } = useCart();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${id}`);
      let o = data.data;
      if (o.payment?.provider && o.payment.provider !== 'COD' && o.payment.status === 'PAYMENT_PENDING') {
        try {
          const v = await api.post(`/orders/${id}/payment/verify`);
          o = v.data.data;
        } catch { /* keep showing pending; customer can refresh */ }
      }
      setOrder(o);
      if (o.payment?.status === 'PAID') fetchCart();
    } catch (err) {
      setError(err.response?.status === 404 || err.response?.status === 403 ? 'Order not found.' : 'Could not load the order. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [id, fetchCart]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error) return <div className="container section"><p>{error} <Link to="/my-orders">Go to my orders</Link></p></div>;

  const isCod = order.payment?.provider === 'COD' || order.paymentMethod === 'COD';
  const pStatus = order.payment?.status;
  let state = 'placed';
  if (!isCod && pStatus === 'PAID') state = 'paid';
  else if (!isCod && pStatus === 'PAYMENT_PENDING') state = 'processing';
  else if (['FAILED', 'VOIDED'].includes(pStatus) || ['Cancelled', 'Expired'].includes(order.orderStatus)) state = 'failed';

  const content = {
    placed: { Icon: FiCheckCircle, title: 'Order Placed!', sub: 'Thank you! Please keep the exact amount ready — you pay in cash when your order arrives.' },
    paid: { Icon: FiCheckCircle, title: 'Payment Received', sub: 'Thank you for your purchase. Your handcrafted pottery is being prepared with care.' },
    processing: { Icon: FiClock, title: 'Payment Processing', sub: 'We are waiting for confirmation from the payment provider. This page will show the result once confirmed.' },
    failed: { Icon: FiXCircle, title: 'Payment Not Completed', sub: 'No money was taken for this order. Your items have been released — you can try again from your cart.' },
  }[state];

  return (
    <div className="success-page">
      <div className="success-card">
        <div className={`success-icon${state === 'failed' ? ' failed' : ''}`}><content.Icon size={56} /></div>
        <h1 className="display success-title">{content.title}</h1>
        <p className="success-sub">{content.sub}</p>
        {state === 'processing' && <button className="btn btn-outline" onClick={() => { setLoading(true); load(); }}>Check again</button>}

        {order.primeReward?.applied && (
          <div className="success-prime"><FiGift size={16} /> Prime Collection reward applied — a free gift is coming with this order.</div>
        )}
        {order.primeReward?.applied && <PrimeReveal />}

        <div className="success-details">
          <div className="success-row"><span>Order</span><span className="mono">{order.orderNumber || `#${order._id.slice(-8).toUpperCase()}`}</span></div>
          <div className="success-row"><span>Payment</span><span>{paymentLabel(order)}</span></div>
          <div className="success-row"><span>Total</span><span style={{ fontWeight: 700 }}>{formatPaise(orderTotalPaise(order))}</span></div>
          <div className="success-row"><span>Shipping to</span><span>{order.shippingAddress?.city}, {order.shippingAddress?.state}</span></div>
          <div className="success-row"><span>Status</span><span className="badge badge-clay">{statusLabel(order.orderStatus)}</span></div>
        </div>

        <div className="success-items">
          {order.orderItems?.map((item, i) => (
            <div key={i} className="success-item">
              <img src={item.image} alt={item.name} />
              <div>
                <p className="success-item-name">{item.name}</p>
                <p className="success-item-qty">Qty: {item.quantity} · {formatPaise(item.lineTotalPaise ?? Math.round(item.price * item.quantity * 100))}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="success-actions">
          <Link to={`/my-orders/${id}`} className="btn btn-primary"><FiPackage size={16} /> Track Order</Link>
          <Link to={state === 'failed' ? '/cart' : '/products'} className="btn btn-outline"><FiHome size={16} /> {state === 'failed' ? 'Back to cart' : 'Continue Shopping'}</Link>
        </div>
      </div>
    </div>
  );
}
