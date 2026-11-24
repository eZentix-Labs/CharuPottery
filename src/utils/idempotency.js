/**
 * One Idempotency-Key per checkout attempt, kept in sessionStorage so a
 * double click, a retry after a network error or a page refresh reuses the
 * same key (the server then returns the same order instead of a new one).
 * Call clearCheckoutKey() once the order is confirmed or the cart changes.
 */
const KEY = 'cp_checkout_idempotency_key';

function newKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function getCheckoutKey() {
  try {
    let k = sessionStorage.getItem(KEY);
    if (!k) { k = newKey(); sessionStorage.setItem(KEY, k); }
    return k;
  } catch {
    return newKey();
  }
}

export function clearCheckoutKey() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
