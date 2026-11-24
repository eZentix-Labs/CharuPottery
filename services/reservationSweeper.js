const logger = require('../utils/logger');

/**
 * Releases unpaid online-payment reservations after their window (DEC-03).
 * COD orders are never touched: they have no reservationExpiresAt.
 * Disabled in tests (tests call expireReservations directly).
 */
function startReservationSweeper(intervalMs = 60000) {
  if (process.env.NODE_ENV === 'test') return null;
  // Lazy require avoids a circular import at startup.
  const { expireReservations } = require('./orderService');
  let running = false;
  return setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const r = await expireReservations();
      if (r.expired || r.paid) logger.info('reservation.sweep', r);
    } catch (err) {
      logger.error('reservation.sweep_failed', { err: err.message });
    } finally {
      running = false;
    }
  }, intervalMs);
}

module.exports = { startReservationSweeper };
