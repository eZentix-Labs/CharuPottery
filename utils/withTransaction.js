const mongoose = require('mongoose');
const ApiError = require('./ApiError');

/**
 * Transactions require a replica set (or sharded cluster). We check the
 * topology once and refuse money/stock writes on a standalone server instead
 * of silently running them without atomicity.
 */
let supportCache = null;

async function transactionsSupported() {
  if (supportCache !== null) return supportCache;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    supportCache = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch (err) {
    return false; // don't cache a failed probe
  }
  return supportCache;
}

function resetTransactionSupportCache() {
  supportCache = null;
}

/**
 * Runs fn(session) inside a transaction. The driver's withTransaction retries
 * TransientTransactionError and UnknownTransactionCommitResult automatically,
 * so fn must be safe to re-run (no external side effects inside it).
 */
async function withTransaction(fn) {
  if (!(await transactionsSupported())) {
    throw new ApiError(
      'This operation is temporarily unavailable: the database is not configured for transactions (replica set required).',
      503
    );
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withTransaction, transactionsSupported, resetTransactionSupportCache };
