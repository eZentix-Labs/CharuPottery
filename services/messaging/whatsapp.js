/**
 * WhatsApp Business integration point (DEC-07, PENDING CLIENT DECISION).
 *
 * Compliance rules enforced here:
 *   - never send to a customer without a recorded, un-revoked opt-in;
 *   - only approved templates via an official provider (Meta Cloud API or an
 *     authorised BSP) — no unofficial automation;
 *   - never send in development or tests.
 *
 * No provider is configured, so send() always returns BLOCKED. Activation
 * requires: provider choice, WABA + phone number, approved templates, and
 * WHATSAPP_PROVIDER / credentials in the environment (see phonepe-activation-style
 * checklist in docs/charu-pottery/release-and-rollback.md).
 */

function hasConsent(user) {
  const c = user?.marketingConsent?.whatsapp;
  return Boolean(c?.optedIn && (!c.optedOutAt || c.optedOutAt < c.optedInAt) && user.phone);
}

function providerStatus() {
  if (process.env.NODE_ENV !== 'production') return { enabled: false, reason: 'WhatsApp sending is disabled outside production.' };
  if (!process.env.WHATSAPP_PROVIDER) return { enabled: false, reason: 'No WhatsApp provider is configured (pending client decision DEC-07).' };
  return { enabled: false, reason: `Provider "${process.env.WHATSAPP_PROVIDER}" has no adapter implemented yet.` };
}

async function send(user /* , templateName, params */) {
  if (!hasConsent(user)) return { outcome: 'SKIPPED_NO_CONSENT' };
  const st = providerStatus();
  if (!st.enabled) return { outcome: 'BLOCKED', reason: st.reason };
  return { outcome: 'BLOCKED', reason: 'unreachable' };
}

module.exports = { hasConsent, providerStatus, send };
