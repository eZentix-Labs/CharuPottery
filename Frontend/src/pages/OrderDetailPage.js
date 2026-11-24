import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiPackage, FiMapPin, FiCreditCard, FiAlertCircle } from 'react-icons/fi';
import { formatPaise, orderTotalPaise } from '../utils/money';
import { paymentLabel, statusLabel } from '../utils/orderStatus';
import './OrderDetailPage.css';

const STATUS_STEPS = ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
const CLOSED = ['Cancelled', 'Refunded', 'Expired'];

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api.get(`/orders/${id}`)
      .then(({ data }) => setOrder(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      const { data } = await api.post(`/orders/${id}/cancel`, { reason: 'Cancelled by customer' });
      setOrder(data.data);
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (!order) return <div className="container section"><p>Order not found. <Link to="/my-orders">Back to orders</Link></p></div>;

  const currentStep = STATUS_STEPS.indexOf(order.orderStatus);
  const isCancelled = CLOSED.includes(order.orderStatus);
  // The server decides cancellation eligibility (before shipping).
  const canCancel = order.canCancel ?? ['AwaitingPayment', 'Pending', 'Processing'].includes(order.orderStatus);
  const pricing = order.pricing;

  return (
    <div className="orderdetail-page">
      <div className="container">
        <div className="orderdetail-header">
          <div>
            <Link to="/my-orders" className="back-link">← My Orders</Link>
            <h1 className="display orderdetail-title">
              {order.orderNumber || `Order #${order._id.slice(-8).toUpperCase()}`}
            </h1>
            <p className="orderdetail-date">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          {canCancel && (
            <button className="btn btn-outline" style={{ borderColor: 'var(--error)', color: 'var(--error)' }} onClick={handleCancel} disabled={cancelling}>
              <FiAlertCircle size={15} /> {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
        </div>

        {/* Status tracker */}
        {order.orderStatus === 'AwaitingPayment' && (
          <div className="cancelled-banner" style={{ background: '#FFF4E5', color: 'var(--brown)' }}>
            <FiAlertCircle size={18} /> Awaiting payment confirmation. Items are reserved for a limited time.
          </div>
        )}
        {!isCancelled && order.orderStatus !== 'AwaitingPayment' ? (
          <div className="status-tracker">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className={`tracker-step${i <= currentStep ? ' done' : ''}${i === currentStep ? ' active' : ''}`}>
                <div className="tracker-circle">
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span className="tracker-label">{s}</span>
                {i < STATUS_STEPS.length - 1 && <div className="tracker-line" />}
              </div>
            ))}
          </div>
        ) : isCancelled ? (
          <div className="cancelled-banner">
            <FiAlertCircle size={18} /> Order {statusLabel(order.orderStatus)}
            {order.cancelReason && <span> · {order.cancelReason}</span>}
          </div>
        ) : null}

        {/* Tracking info */}
        {order.trackingNumber && (
          <div className="tracking-info">
            <FiPackage size={15} /> Tracking: <strong>{order.trackingNumber}</strong>
            {order.carrier && <span> via {order.carrier}</span>}
          </div>
        )}

        <div className="orderdetail-grid">
          {/* Items */}
          <div className="orderdetail-main">
            <div className="od-section">
              <h3 className="od-section-title">Items Ordered</h3>
              {order.orderItems?.map((item, i) => (
                <div key={i} className="od-item">
                  <img src={item.image} alt={item.name} className="od-item-img" />
                  <div className="od-item-info">
                    <p className="od-item-name">{item.name}</p>
                    <p className="od-item-qty">Quantity: {item.quantity}</p>
                    <p className="od-item-price">{formatPaise(item.unitPricePaise ?? Math.round(item.price * 100))} each</p>
                  </div>
                  <p className="od-item-total">{formatPaise(item.lineTotalPaise ?? Math.round(item.price * item.quantity * 100))}</p>
                </div>
              ))}
            </div>

            {/* Status history */}
            {order.statusHistory?.length > 0 && (
              <div className="od-section">
                <h3 className="od-section-title">Status History</h3>
                <div className="status-history">
                  {[...order.statusHistory].reverse().map((h, i) => (
                    <div key={i} className="history-item">
                      <div className="history-dot" />
                      <div>
                        <p className="history-status">{h.status}</p>
                        {h.note && <p className="history-note">{h.note}</p>}
                        <p className="history-date">{new Date(h.changedAt).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="orderdetail-sidebar">
            <div className="od-info-card">
              <h3 className="od-info-title"><FiMapPin size={15} /> Shipping Address</h3>
              <p>{order.shippingAddress?.fullName}</p>
              <p>{order.shippingAddress?.street}</p>
              <p>{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.postalCode}</p>
              <p>{order.shippingAddress?.country}</p>
              <p>{order.shippingAddress?.phone}</p>
            </div>

            <div className="od-info-card">
              <h3 className="od-info-title"><FiCreditCard size={15} /> Payment</h3>
              <p>{order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod}</p>
              <p style={{ color: order.payment?.status === 'PAID' || order.isPaid ? 'var(--success)' : 'var(--stone)', fontWeight: 500, marginTop: 4 }}>
                {paymentLabel(order)}
                {order.paidAt && (order.payment?.status === 'PAID') && ` · ${new Date(order.paidAt).toLocaleDateString('en-IN')}`}
              </p>
              {order.payment?.refund?.status && order.payment.refund.status !== 'NONE' && (
                <p className="history-note">Refund: {formatPaise(order.payment.refund.amountPaise)} · {order.payment.refund.status.toLowerCase()}</p>
              )}
              {order.primeReward?.applied && <p className="history-note">🎁 Prime Collection gift included</p>}
            </div>

            <div className="od-info-card">
              <h3 className="od-info-title">Order Summary</h3>
              <div className="od-totals">
                <div className="od-total-row"><span>Subtotal</span><span>{formatPaise(pricing?.itemsPaise ?? Math.round(order.itemsPrice * 100))}</span></div>
                {(pricing?.discountPaise > 0 || order.discountAmount > 0) && (
                  <div className="od-total-row" style={{ color: 'var(--success)' }}><span>Discount{pricing?.couponCode ? ` (${pricing.couponCode})` : ''}</span><span>−{formatPaise(pricing?.discountPaise ?? Math.round(order.discountAmount * 100))}</span></div>
                )}
                <div className="od-total-row"><span>Tax</span><span>{formatPaise(pricing?.taxPaise ?? Math.round(order.taxPrice * 100))}</span></div>
                <div className="od-total-row"><span>Shipping</span><span>{(pricing?.shippingPaise ?? order.shippingPrice) === 0 ? 'Free' : formatPaise(pricing?.shippingPaise ?? Math.round(order.shippingPrice * 100))}</span></div>
                <hr className="divider" />
                <div className="od-total-row grand"><span>Total</span><span>{formatPaise(orderTotalPaise(order))}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
