/**
 * Payment configuration. Read at call time so tests can change env safely.
 *
 * Active today: Cash on Delivery only.
 * PhonePe Standard Checkout is implemented but DISABLED until the merchant
 * account is approved and credentials are supplied through environment
 * variables (never in source or docs). See docs/charu-pottery/phonepe-activation.md.
 *
 * PhonePe is considered enabled only when ALL of these hold:
 *   - PHONEPE_ENABLED=true
 *   - client id, secret, version, callback username/password and
 *     PUBLIC_STOREFRONT_URL are present
 *   - in NODE_ENV=production: PHONEPE_ENV=production AND
 *     PHONEPE_PRODUCTION_APPROVED=true (sandbox is never used in production)
 */

const bool = (v) => String(v || '').toLowerCase() === 'true';

function phonepeConfig() {
  const env = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
  const cfg = {
    requested: bool(process.env.PHONEPE_ENABLED),
    env: env === 'production' ? 'production' : 'sandbox',
    clientId: process.env.PHONEPE_CLIENT_ID || '',
    clientSecret: process.env.PHONEPE_CLIENT_SECRET || '',
    clientVersion: process.env.PHONEPE_CLIENT_VERSION || '',
    callbackUsername: process.env.PHONEPE_CALLBACK_USERNAME || '',
    callbackPassword: process.env.PHONEPE_CALLBACK_PASSWORD || '',
    storefrontUrl: (process.env.PUBLIC_STOREFRONT_URL || '').replace(/\/$/, ''),
    productionApproved: bool(process.env.PHONEPE_PRODUCTION_APPROVED),
  };
  const missing = ['clientId', 'clientSecret', 'clientVersion', 'callbackUsername', 'callbackPassword', 'storefrontUrl'].filter(
    (k) => !cfg[k]
  );
  let reason = null;
  if (!cfg.requested) reason = 'PHONEPE_ENABLED is not true';
  else if (missing.length) reason = `missing configuration: ${missing.join(', ')}`;
  else if (process.env.NODE_ENV === 'production' && cfg.env !== 'production') reason = 'sandbox credentials cannot be used in production';
  else if (process.env.NODE_ENV === 'production' && !cfg.productionApproved) reason = 'PHONEPE_PRODUCTION_APPROVED is not true';
  cfg.enabled = reason === null;
  cfg.disabledReason = reason;
  return cfg;
}

function codEnabled() {
  return process.env.COD_ENABLED === undefined ? true : bool(process.env.COD_ENABLED);
}

function enabledMethods() {
  const methods = [];
  if (codEnabled()) methods.push('COD');
  if (phonepeConfig().enabled) methods.push('PHONEPE');
  return methods;
}

module.exports = { phonepeConfig, codEnabled, enabledMethods };
