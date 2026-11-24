const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { phonepeCallback } = require('./controllers/paymentController');
const { legacyStripeWebhookGone } = require('./legacy/stripe/webhookController');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contentRoutes = require('./routes/contentRoutes');
const accountRoutes = require('./routes/accountRoutes');
const { transactionsSupported } = require('./utils/withTransaction');

/**
 * CORS allow-list: CLIENT_URL and ADMIN_URL may each contain a
 * comma-separated list of exact origins.
 */
function allowedOrigins() {
  const raw = [process.env.CLIENT_URL, process.env.ADMIN_URL].filter(Boolean).join(',');
  const list = raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return list.length ? list : ['http://localhost:3000'];
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const origins = allowedOrigins();
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || origins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    })
  );
  app.use(compression());
  if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

  const isTest = process.env.NODE_ENV === 'test';

  // Payment-provider callbacks are verified by signature/credentials and must
  // not be throttled (providers retry). They need the RAW body, so they are
  // registered before the JSON parser and before the API rate limiter.
  app.post('/api/v1/payments/phonepe/callback', express.text({ type: '*/*', limit: '64kb' }), phonepeCallback);
  app.post('/api/v1/webhooks/stripe', legacyStripeWebhookGone);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 100000 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  });
  app.use('/api', apiLimiter);

  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: true, limit: '20kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(xss());

  // Locally stored uploads (images/videos). Served with nosniff (helmet) and
  // only files whose type was verified at upload time are ever written here.
  app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny', index: false, maxAge: '7d' }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/account', accountRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/cart', cartRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/reviews', reviewRoutes);
  app.use('/api/v1/upload', uploadRoutes);
  app.use('/api/v1/content', contentRoutes);
  app.use('/api/v1/admin', adminRoutes);

  // Health check: reports DB connectivity and transaction support without secrets.
  app.get('/api/v1/health', async (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    const tx = dbUp ? await transactionsSupported() : false;
    res.status(dbUp ? 200 : 503).json({
      success: dbUp,
      message: 'Charu Pottery API',
      database: dbUp ? 'connected' : 'disconnected',
      transactions: tx ? 'supported' : 'unavailable',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (req, res) => res.send('Charu Pottery API — see /api/v1/health'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, allowedOrigins };
