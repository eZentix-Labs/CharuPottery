/** Safe pagination: page ≥ 1, 1 ≤ limit ≤ max. */
function paginate(query, { defaultLimit = 20, max = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// Escape user text before using it inside a RegExp (prevents regex injection / ReDoS patterns).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { paginate, escapeRegex };
