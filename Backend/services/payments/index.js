const { phonepeConfig } = require('../../config/payments');
const { createPhonePeProvider } = require('./phonepeProvider');

/**
 * Provider registry. Application code asks for a provider by name and never
 * imports a gateway SDK directly. COD needs no gateway.
 */
let phonepeInstance = null;
let phonepeKey = null;
let sdkOverride = null; // tests only

function getOnlineProvider(name) {
  if (name !== 'PHONEPE') return null;
  const cfg = phonepeConfig();
  if (!cfg.enabled) return null;
  const key = `${cfg.env}:${cfg.clientId}:${cfg.clientVersion}`;
  if (!phonepeInstance || phonepeKey !== key) {
    phonepeInstance = createPhonePeProvider(cfg, { sdk: sdkOverride || undefined });
    phonepeKey = key;
  }
  return phonepeInstance;
}

function __setPhonePeSdkForTests(sdk) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only');
  sdkOverride = sdk;
  phonepeInstance = null;
  phonepeKey = null;
}

module.exports = { getOnlineProvider, __setPhonePeSdkForTests };
