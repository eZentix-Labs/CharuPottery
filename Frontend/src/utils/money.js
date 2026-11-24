/** Format integer paise as Indian rupees. The server is the source of all amounts. */
export function formatPaise(paise) {
  if (paise === null || paise === undefined || Number.isNaN(Number(paise))) return '—';
  const rupees = Number(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: rupees % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const orderTotalPaise = (order) => order?.pricing?.totalPaise ?? Math.round((order?.totalPrice || 0) * 100);
