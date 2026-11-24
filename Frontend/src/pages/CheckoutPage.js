import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiMapPin, FiCreditCard, FiCheck, FiGift, FiTag, FiAlertTriangle } from 'react-icons/fi';
import { formatPaise } from '../utils/money';
import { getCheckoutKey, clearCheckoutKey } from '../utils/idempotency';
import './CheckoutPage.css';

const STEPS = ['Address', 'Payment', 'Review'];

/**
 * Checkout. Every amount shown here comes from the server quote; the browser
 * does no price maths. The order is placed with the total the customer saw
 * (expectedTotalPaise); if prices changed meanwhile the server answers 409
 * and we show the new total for confirmation.
 */
export default function CheckoutPage() {
  const { user } = useAuth();
  const { cart, cartLoading, fetchCart } = useCart();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const submitting = useRef(false);

  const defaultAddr = user?.addresses?.find((a) => a.isDefault) || user?.addresses?.[0];
  const [address, setAddress] = useState({
    fullName: user?.name || '',
    street: defaultAddr?.street || '',
    city: defaultAddr?.city || '',
    state: defaultAddr?.state || '',
    postalCode: defaultAddr?.postalCode || '',
    country: defaultAddr?.country || 'India',
    phone: defaultAddr?.phone || user?.phone || '',
  });
  const [addrErrors, setAddrErrors] = useState({});
  const [methods, setMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [usePrime, setUsePrime] = useState(false);
  const [priceNotice, setPriceNotice] = useState('');

  const loadQuote = useCallback(async (code) => {
    try {
      const { data } = await api.get('/orders/checkout/quote', { params: code ? { couponCode: code } : {} });
      setQuote(data.data);
      setQuoteError('');
      return data.data;
    } catch (err) {
      setQuoteError(err.response?.data?.message || 'Could not load your order total. Please retry.');
      return null;
    }
  }, []);

  useEffect(() => { loadQuote(couponCode); }, [loadQuote, couponCode, cart]);

  useEffect(() => {
    api.get('/payments/methods')
      .then(({ data }) => {
        setMethods(data.data || []);
        if (data.data?.length && !data.data.some((m) => m.id === paymentMethod)) setPaymentMethod(data.data[0].id);
      })
      .catch(() => setMethods([{ id: 'COD', label: 'Cash on Delivery', description: 'Pay in cash when your order is delivered.' }]));
  }, []);

  const validateAddress = () => {
    const e = {};
    if ((address.fullName || '').trim().length < 2) e.fullName = 'Required';
    if ((address.street || '').trim().length < 5) e.street = 'Please enter the full street address';
    if (!address.city.trim()) e.city = 'Required';
    if (!address.state.trim()) e.state = 'Required';
    if ((address.country || 'India').toLowerCase() === 'india') {
      if (!/^[1-9][0-9]{5}$/.test(String(address.postalCode).trim())) e.postalCode = 'Enter a valid 6-digit PIN code';
      if (!/^(\+91)?[6-9][0-9]{9}$/.test(String(address.phone).replace(/[\s-]/g, ''))) e.phone = 'Enter a valid 10-digit mobile number';
    }
    return e;
  };

  const handleNextStep = () => {
    if (step === 0) {
      const e = validateAddress();
      if (Object.keys(e).length) { setAddrErrors(e); return; }
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const q = await loadQuote(code);
    const problem = q?.problems?.find((p) => p.code === 'COUPON_INVALID');
    if (problem) { toast.error(problem.message); return; }
    if (q) { setCouponCode(code); clearCheckoutKey(); toast.success(`Coupon ${code} applied`); }
  };

  const removeCoupon = () => { setCouponCode(''); setCouponInput(''); clearCheckoutKey(); };

  const handlePlaceOrder = async () => {
    if (submitting.current || !quote) return; // guards against double clicks
    if (quote.problems?.length) { toast.error(quote.problems[0].message); return; }
    submitting.current = true;
    setPlacing(true);
    setPriceNotice('');
    try {
      const { data } = await api.post(
        '/orders/checkout',
        {
          shippingAddress: address,
          paymentMethod,
          couponCode: couponCode || undefined,
          applyPrimeReward: usePrime || undefined,
          expectedTotalPaise: quote.totalPaise,
          source: { channel: 'web', referrer: document.referrer ? document.referrer.slice(0, 200) : undefined },
        },
        { headers: { 'Idempotency-Key': getCheckoutKey() } }
      );
      const order = data.data;
      clearCheckoutKey();
      if (data.payment?.provider === 'PHONEPE' && data.payment.redirectUrl) {
        window.location.assign(data.payment.redirectUrl); // PhonePe hosted checkout
        return;
      }
      await fetchCart();
      navigate(`/order-success/${order._id}`, { replace: true });
    } catch (err) {
      const res = err.response?.data;
      if (res?.code === 'PRICE_CHANGED' || res?.code === 'CART_INVALID') {
        if (res.details?.quote) setQuote(res.details.quote);
        clearCheckoutKey();
        setPriceNotice(res.message);
        setStep(2);
      } else if (res?.code === 'INVALID_ADDRESS') {
        setAddrErrors(res.details || {});
        setStep(0);
        toast.error(res.message);
      } else if (res?.code === 'PAYMENT_INIT_FAILED') {
        toast.error(res.message);
        if (res.details?.orderId) navigate(`/my-orders/${res.details.orderId}`);
      } else {
        toast.error(res?.message || 'Could not place the order. Please check your connection and try again.');
      }
    } finally {
      submitting.current = false;
      setPlacing(false);
    }
  };

  const set = (k, v) => { setAddress((p) => ({ ...p, [k]: v })); setAddrErrors((p) => ({ ...p, [k]: '' })); clearCheckoutKey(); };

  if (cartLoading && !cart) return <div className="page-loader"><div className="spinner" /></div>;
  if (cart && (cart.items || []).length === 0) return <Navigate to="/cart" replace />;

  const lines = quote?.lines || [];
  const selectedMethod = methods.find((m) => m.id === paymentMethod);

  return (
    <div className="checkout-page">
      <div className="container">
        <h1 className="checkout-title display">Checkout</h1>

        <div className="steps-bar" aria-label="Checkout progress">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item${i <= step ? ' done' : ''}${i === step ? ' active' : ''}`}>
              <div className="step-circle">{i < step ? <FiCheck size={14} /> : i + 1}</div>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        <div className="checkout-layout">
          <div className="checkout-main">
            {step === 0 && (
              <div className="checkout-section">
                <h2 className="checkout-section-title"><FiMapPin size={18} /> Shipping Address</h2>
                {user?.addresses?.length > 0 && (
                  <div className="saved-addresses">
                    <p className="saved-label">Saved addresses</p>
                    <div className="saved-list">
                      {user.addresses.map((addr) => (
                        <button type="button" key={addr._id} className="saved-addr-btn" onClick={() => {
                          setAddress({ fullName: user.name, street: addr.street, city: addr.city, state: addr.state, postalCode: addr.postalCode, country: addr.country, phone: addr.phone });
                          setAddrErrors({});
                          clearCheckoutKey();
                        }}>
                          <strong>{addr.label}</strong>
                          <span>{addr.street}, {addr.city}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="addr-grid">
                  <Field label="Full Name" value={address.fullName} onChange={(v) => set('fullName', v)} error={addrErrors.fullName} span2 autoComplete="name" />
                  <Field label="Street Address" value={address.street} onChange={(v) => set('street', v)} error={addrErrors.street} span2 autoComplete="street-address" />
                  <Field label="City" value={address.city} onChange={(v) => set('city', v)} error={addrErrors.city} autoComplete="address-level2" />
                  <Field label="State" value={address.state} onChange={(v) => set('state', v)} error={addrErrors.state} autoComplete="address-level1" />
                  <Field label="PIN Code" value={address.postalCode} onChange={(v) => set('postalCode', v)} error={addrErrors.postalCode} inputMode="numeric" autoComplete="postal-code" />
                  <Field label="Mobile" value={address.phone} onChange={(v) => set('phone', v)} error={addrErrors.phone} type="tel" autoComplete="tel" />
                  <Field label="Country" value={address.country} onChange={(v) => set('country', v)} autoComplete="country-name" />
                </div>
                <button className="btn btn-primary step-next" onClick={handleNextStep}>Continue to Payment</button>
              </div>
            )}

            {step === 1 && (
              <div className="checkout-section">
                <h2 className="checkout-section-title"><FiCreditCard size={18} /> Payment Method</h2>
                <div className="payment-options" role="radiogroup">
                  {methods.map((opt) => (
                    <label key={opt.id} className={`payment-option${paymentMethod === opt.id ? ' selected' : ''}`}>
                      <input type="radio" name="payment" value={opt.id} checked={paymentMethod === opt.id} onChange={() => { setPaymentMethod(opt.id); clearCheckoutKey(); }} />
                      <span className="payment-icon" aria-hidden="true">{opt.id === 'COD' ? '💵' : '📱'}</span>
                      <div>
                        <p className="payment-label">{opt.label}</p>
                        <p className="payment-desc">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {methods.length === 1 && methods[0].id === 'COD' && (
                  <p className="stripe-note">Online payments (UPI, cards) are coming soon. For now, pay in cash when your order arrives.</p>
                )}

                <div className="checkout-extras">
                  <p className="saved-label"><FiTag size={13} /> Coupon code</p>
                  {couponCode ? (
                    <div className="coupon-applied">
                      <span><strong>{couponCode}</strong> applied · you save {formatPaise(quote?.discountPaise)}</span>
                      <button type="button" className="btn btn-ghost" onClick={removeCoupon}>Remove</button>
                    </div>
                  ) : (
                    <div className="coupon-row">
                      <input className="form-input" placeholder="Enter code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} aria-label="Coupon code" />
                      <button type="button" className="btn btn-outline" onClick={applyCoupon}>Apply</button>
                    </div>
                  )}
                  {quote?.prime?.rewardsAvailable > 0 && (
                    <label className="prime-toggle">
                      <input type="checkbox" checked={usePrime} onChange={(e) => { setUsePrime(e.target.checked); clearCheckoutKey(); }} />
                      <FiGift size={15} /> Use my Prime Collection reward — a free gift with this order
                    </label>
                  )}
                </div>

                <div className="step-btns">
                  <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
                  <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!methods.length}>Review Order</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="checkout-section">
                <h2 className="checkout-section-title"><FiCheck size={18} /> Review Order</h2>
                {priceNotice && (
                  <div className="price-notice" role="alert"><FiAlertTriangle size={16} /> {priceNotice} The new total is <strong>{formatPaise(quote?.totalPaise)}</strong>.</div>
                )}
                {quote?.problems?.length > 0 && (
                  <div className="price-notice" role="alert">
                    {quote.problems.map((p, i) => <p key={i}><FiAlertTriangle size={14} /> {p.message}</p>)}
                  </div>
                )}
                <div className="review-blocks">
                  <div className="review-block">
                    <div className="review-block-header">
                      <p className="review-block-title">Shipping to</p>
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep(0)}>Edit</button>
                    </div>
                    <p>{address.fullName}</p>
                    <p>{address.street}, {address.city}, {address.state} {address.postalCode}</p>
                    <p>{address.country} · {address.phone}</p>
                  </div>
                  <div className="review-block">
                    <div className="review-block-header">
                      <p className="review-block-title">Payment</p>
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep(1)}>Edit</button>
                    </div>
                    <p>{selectedMethod?.label || paymentMethod}</p>
                    {paymentMethod === 'COD' && <p className="payment-desc">Your order will be marked paid only after the cash is collected.</p>}
                    {usePrime && <p className="payment-desc"><FiGift size={12} /> Prime Collection free gift included</p>}
                  </div>
                </div>

                <div className="review-items">
                  {lines.map((item) => (
                    <div key={item.product} className="review-item">
                      <img src={item.image} alt={item.name} />
                      <div>
                        <p className="review-item-name">{item.name}</p>
                        <p className="review-item-qty">Qty: {item.quantity}{item.priceChanged && <span className="price-changed"> · price updated</span>}</p>
                      </div>
                      <p className="review-item-price">{formatPaise(item.lineTotalPaise)}</p>
                    </div>
                  ))}
                </div>

                <div className="step-btns">
                  <button className="btn btn-outline" onClick={() => setStep(1)} disabled={placing}>Back</button>
                  <button className="btn btn-primary" onClick={handlePlaceOrder} disabled={placing || !quote || quote.problems?.length > 0}>
                    {placing ? 'Placing order…' : `${priceNotice ? 'Confirm new total' : 'Place Order'} · ${formatPaise(quote?.totalPaise)}`}
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="checkout-sidebar" aria-label="Order summary">
            <h3 className="summary-title">Order Summary</h3>
            {quoteError && <p className="form-error">{quoteError} <button className="btn btn-ghost" onClick={() => loadQuote(couponCode)}>Retry</button></p>}
            {!quote && !quoteError && <div className="spinner" />}
            {quote && (
              <>
                <div className="sidebar-items">
                  {lines.map((item) => (
                    <div key={item.product} className="sidebar-item">
                      <span className="sidebar-item-name">{item.name} <span className="sidebar-item-qty">×{item.quantity}</span></span>
                      <span>{formatPaise(item.lineTotalPaise)}</span>
                    </div>
                  ))}
                </div>
                <hr className="divider" />
                <div className="sidebar-totals">
                  <div className="sidebar-row"><span>Subtotal</span><span>{formatPaise(quote.itemsPaise)}</span></div>
                  {quote.discountPaise > 0 && <div className="sidebar-row" style={{ color: 'var(--success)' }}><span>Discount{quote.couponCode ? ` (${quote.couponCode})` : ''}</span><span>−{formatPaise(quote.discountPaise)}</span></div>}
                  <div className="sidebar-row"><span>Tax ({quote.taxRateBasisPoints / 100}%)</span><span>{formatPaise(quote.taxPaise)}</span></div>
                  <div className="sidebar-row"><span>Shipping</span><span>{quote.shippingPaise === 0 ? 'Free' : formatPaise(quote.shippingPaise)}</span></div>
                  <hr className="divider" />
                  <div className="sidebar-row total"><span>Total</span><span>{formatPaise(quote.totalPaise)}</span></div>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, error, type = 'text', span2, ...rest }) {
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={`form-group${span2 ? ' span2' : ''}`}>
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className={`form-input${error ? ' error' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} {...rest} />
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
