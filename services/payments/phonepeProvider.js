/**
 * PhonePe Standard Checkout provider (isolated: the only module that talks to
 * the PhonePe SDK). Built against the official Node SDK
 * `@phonepe-pg/pg-sdk-node` (StandardCheckoutClient):
 *   pay(StandardCheckoutPayRequest)       → { orderId, state, expireAt, redirectUrl }
 *   getOrderStatus(merchantOrderId)       → { orderId, state, amount, paymentDetails[] }
 *   refund(RefundRequest)                 → { refundId, amount, state }
 *   getRefundStatus(merchantRefundId)     → { merchantRefundId, state, amount, ... }
 *   validateCallback(user, pass, auth, body) → { type, payload }
 *
 * The SDK is NOT a dependency yet. It is loaded lazily only when PhonePe is
 * enabled; install it during activation (see phonepe-activation.md). Tests
 * inject a fake SDK with the same surface; no network calls are made.
 *
 * All results are normalised into provider-independent shapes:
 *   payment state: 'COMPLETED' | 'FAILED' | 'PENDING'
 *   refund state:  'COMPLETED' | 'FAILED' | 'PENDING'
 */

const SDK_PACKAGE = '@phonepe-pg/pg-sdk-node';

function loadSdk() {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    return require(SDK_PACKAGE);
  } catch (err) {
    const e = new Error(`PhonePe SDK (${SDK_PACKAGE}) is not installed. See docs/charu-pottery/phonepe-activation.md.`);
    e.code = 'PHONEPE_SDK_MISSING';
    throw e;
  }
}

const PAYMENT_STATES = ['COMPLETED', 'FAILED', 'PENDING'];

function normalizeState(s) {
  const v = String(s || '').toUpperCase();
  if (PAYMENT_STATES.includes(v)) return v;
  if (v === 'CONFIRMED' || v === 'ACCEPTED') return 'PENDING'; // refund accepted, not yet completed
  return 'PENDING'; // unknown → never treat as success
}

// Keep only non-sensitive fields from provider payloads for the audit trail.
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const pick = ['orderId', 'state', 'amount', 'expireAt', 'refundId', 'merchantRefundId', 'originalMerchantOrderId', 'errorCode', 'detailedErrorCode'];
  const out = {};
  for (const k of pick) if (obj[k] !== undefined) out[k] = obj[k];
  if (Array.isArray(obj.paymentDetails)) {
    out.paymentDetails = obj.paymentDetails.map((p) => ({
      transactionId: p.transactionId, paymentMode: p.paymentMode, state: p.state, amount: p.amount,
      timestamp: p.timestamp, errorCode: p.errorCode,
    }));
  }
  return out;
}

function latestPayment(details) {
  if (!Array.isArray(details) || !details.length) return null;
  return [...details].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
}

function createPhonePeProvider(config, { sdk } = {}) {
  const SDK = sdk || loadSdk();
  const env = config.env === 'production' ? SDK.Env.PRODUCTION : SDK.Env.SANDBOX;
  // SDK docs: create the client once and reuse it.
  const client = SDK.StandardCheckoutClient.getInstance(config.clientId, config.clientSecret, Number(config.clientVersion) || config.clientVersion, env);

  return {
    name: 'PHONEPE',

    async initiate({ merchantOrderId, amountPaise, redirectUrl, expireAfterSeconds, orderRef }) {
      let builder = SDK.StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantOrderId)
        .amount(amountPaise)
        .redirectUrl(redirectUrl);
      if (expireAfterSeconds && typeof builder.expireAfter === 'function') builder = builder.expireAfter(expireAfterSeconds);
      if (orderRef && SDK.MetaInfo && typeof builder.metaInfo === 'function') {
        builder = builder.metaInfo(SDK.MetaInfo.builder().udf1(String(orderRef)).build());
      }
      const res = await client.pay(builder.build());
      return {
        providerOrderId: res.orderId,
        state: normalizeState(res.state),
        redirectUrl: res.redirectUrl,
        expireAt: res.expireAt,
        raw: sanitize(res),
      };
    },

    async getStatus(merchantOrderId) {
      const res = await client.getOrderStatus(merchantOrderId);
      const p = latestPayment(res.paymentDetails);
      return {
        state: normalizeState(res.state),
        amountPaise: Number(res.amount),
        providerOrderId: res.orderId,
        transactionId: p?.transactionId,
        paymentMode: p?.paymentMode,
        raw: sanitize(res),
      };
    },

    async refund({ merchantRefundId, merchantOrderId, amountPaise }) {
      const req = SDK.RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(merchantOrderId)
        .amount(amountPaise)
        .build();
      const res = await client.refund(req);
      return { providerRefundId: res.refundId, state: normalizeState(res.state), amountPaise: Number(res.amount), raw: sanitize(res) };
    },

    async getRefundStatus(merchantRefundId) {
      const res = await client.getRefundStatus(merchantRefundId);
      return { state: normalizeState(res.state), amountPaise: Number(res.amount), raw: sanitize(res) };
    },

    /**
     * Verify a callback with the SDK's validateCallback (credentials configured
     * on the PhonePe dashboard). Returns null when verification fails.
     */
    verifyCallback({ authorization, rawBody }) {
      if (!authorization || !rawBody) return null;
      try {
        const cb = client.validateCallback(config.callbackUsername, config.callbackPassword, authorization, rawBody);
        if (!cb || !cb.payload) return null;
        const pl = cb.payload;
        const p = latestPayment(pl.paymentDetails);
        return {
          type: String(cb.type || ''),
          merchantOrderId: pl.originalMerchantOrderId || pl.merchantOrderId,
          providerOrderId: pl.orderId,
          merchantRefundId: pl.merchantRefundId,
          providerRefundId: pl.refundId,
          state: normalizeState(pl.state),
          amountPaise: Number(pl.amount),
          transactionId: p?.transactionId,
          raw: sanitize(pl),
        };
      } catch (err) {
        return null;
      }
    },
  };
}

module.exports = { createPhonePeProvider, normalizeState, sanitize, SDK_PACKAGE };
