const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
const { createApp } = require('./app');
const { startReservationSweeper } = require('./services/reservationSweeper');
const { transactionsSupported } = require('./utils/withTransaction');
const logger = require('./utils/logger');

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

async function main() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  await connectDB();
  if (!(await transactionsSupported())) {
    logger.error('db.transactions_unavailable', {
      msg: 'MongoDB is not a replica set. Checkout, cancellation, refunds and stock changes will return 503 until it is.',
    });
  }

  const app = createApp();
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  const sweeper = startReservationSweeper();

  const shutdown = (code) => {
    clearInterval(sweeper);
    server.close(() => process.exit(code));
  };
  process.on('unhandledRejection', (err) => {
    logger.error('unhandledRejection', { err: err && err.message });
    shutdown(1);
  });
  process.on('SIGTERM', () => shutdown(0));
}

main();
