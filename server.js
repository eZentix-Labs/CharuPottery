const path = require('path');
const express = require('express');

const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

dotenv.config();

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { stripeWebhook } = require('./controllers/webhookController');

// Route imports
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

connectDB();

const app = express();
app.set('trust proxy', 1); // Trust first proxy (for rate limiting behind proxies/load balancers)

// ─── Security & utility middleware ───────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000' ,
    credentials: true,
  })
);
app.use(compression());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting — protects auth & API from brute force / abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', apiLimiter);

// ─── Stripe webhook needs the RAW request body for signature
//     verification, so it MUST be registered BEFORE express.json()
//     parses the body globally. ─────────────────────────────────
app.post(
  '/api/v1/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

// ─── Body parsers (after the webhook raw-body route above) ───────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xss());

// Serve uploaded files locally if not using Cloudinary
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/upload', uploadRoutes);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pottery & Ceramics E-commerce API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.send('🏺 Pottery & Ceramics E-commerce API — see /api/v1/health for status');
});

// 404 + global error handler (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
  );
});

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
