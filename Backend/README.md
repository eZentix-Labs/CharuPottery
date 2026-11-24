# 🏺 Earthen & Co. — Pottery, Ceramics & Clay Art E-commerce API

A production-style **MERN stack backend** for an online pottery/ceramics/clay-art store. Built with Node.js, Express, and MongoDB (Mongoose), this API powers products, categories, cart, checkout, orders, reviews, and image uploads — with JWT auth, Stripe payments, and admin controls.

> This is the **backend only**. The React frontend will be provided separately once you say "done."

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT (access + refresh tokens), bcrypt |
| Payments | Stripe |
| Image storage | Cloudinary (via Multer memory storage) |
| Validation | express-validator |
| Security | helmet, express-rate-limit, mongo-sanitize, xss-clean, cors |

---

## 📁 Project Structure

```
pottery-backend/
├── config/
│   ├── db.js              # MongoDB connection
│   └── cloudinary.js      # Cloudinary config
├── controllers/           # Business logic for each resource
├── middleware/
│   ├── authMiddleware.js  # protect / authorize / optionalAuth
│   ├── errorMiddleware.js # centralized error handling
│   ├── uploadMiddleware.js# Multer config
│   └── validators.js      # express-validator chains
├── models/                # Mongoose schemas (User, Product, Category, Cart, Order, Review)
├── routes/                # Express routers per resource
├── utils/
│   ├── apiFeatures.js     # filter / search / sort / paginate helper
│   ├── ApiError.js        # custom error class
│   ├── generateToken.js   # JWT helpers
│   ├── sendEmail.js       # Nodemailer wrapper
│   └── seeder.js          # sample data seeder
├── uploads/                # local fallback for static file serving
├── .env.example
├── server.js
└── package.json
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
cd pottery-backend
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Then fill in real values for:
- `MONGO_URI` — your MongoDB connection string (local or Atlas)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — long random strings
- `CLOUDINARY_*` — from your Cloudinary dashboard (free tier works)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from your Stripe dashboard
- `SMTP_*` — for password reset emails (Gmail App Password works fine)

### 3. Seed sample pottery data (optional but recommended)
```bash
npm run seed
```
This creates an admin account and 5 sample products across 5 categories.
- **Admin login:** `admin@charu.in` / `Admin@123`

### 4. Run the server
```bash
npm run dev      # development, with nodemon auto-restart
npm start         # production
```

Server runs at `http://localhost:5000`. Check health: `GET /api/v1/health`

---

## 📡 API Reference

Base URL: `/api/v1`

### Auth — `/auth`
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/register` | Public | Create account |
| POST | `/login` | Public | Login, returns access + refresh token cookies |
| POST | `/logout` | Private | Clears auth cookies |
| POST | `/refresh-token` | Public | Get new access token from refresh token |
| GET | `/me` | Private | Get current user profile |
| PUT | `/update-profile` | Private | Update name/phone |
| PUT | `/update-password` | Private | Change password |
| POST | `/forgot-password` | Public | Send password reset email |
| PUT | `/reset-password/:resetToken` | Public | Set new password |
| POST | `/addresses` | Private | Add a shipping address |
| DELETE | `/addresses/:addressId` | Private | Remove a shipping address |
| PUT | `/wishlist/:productId` | Private | Toggle product in wishlist |

### Products — `/products`
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List products — filter/search/sort/paginate |
| GET | `/featured` | Public | Featured products |
| GET | `/:idOrSlug` | Public | Single product by id or slug |
| GET | `/:id/related` | Public | Related products (same category) |
| POST | `/` | Admin | Create product |
| PUT | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Soft-delete (deactivate) |
| DELETE | `/:id/permanent` | Admin | Permanently delete |
| PATCH | `/:id/stock` | Admin | Update stock count |

**Query params for `GET /products`:**
`?category=<id>&clayType=Stoneware&price[gte]=500&price[lte]=2000&keyword=vase&sort=-price&page=1&limit=12&isFeatured=true`

### Categories — `/categories`
Standard CRUD — `GET /`, `GET /slug/:slug`, `POST /` (admin), `PUT /:id` (admin), `DELETE /:id` (admin)

### Cart — `/cart` (all require login)
`GET /` · `POST /` `{productId, quantity}` · `PUT /:productId` `{quantity}` · `DELETE /:productId` · `DELETE /` (clear)

### Orders — `/orders` (all require login)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/create-payment-intent` | Private | Stripe PaymentIntent for current cart |
| POST | `/` | Private | Place order (after payment, or COD) |
| GET | `/my-orders` | Private | Logged-in user's order history |
| GET | `/:id` | Private | Single order (owner or admin) |
| PUT | `/:id/cancel` | Private | Cancel a pending/processing order |
| GET | `/` | Admin | All orders (filter/sort/paginate) |
| PUT | `/:id/status` | Admin | Update status / tracking number |
| GET | `/analytics/summary` | Admin | Revenue & order count summary |

### Reviews — nested under products, plus standalone
`GET /products/:productId/reviews` · `POST /products/:productId/reviews` (private) · `PUT /reviews/:id` · `DELETE /reviews/:id`

### Uploads — `/upload`
`POST /products` (admin, field name `images`, up to 6 files) · `POST /avatar` (private, field name `avatar`) · `DELETE /:publicId` (admin)

### Stripe Webhook
`POST /api/v1/webhooks/stripe` — point your Stripe CLI/dashboard webhook here. Uses raw body parsing (already wired in `server.js`).

---

## 🔑 Auth Flow Notes

- On register/login, the API sets **httpOnly cookies** (`accessToken`, `refreshToken`) AND returns `accessToken` in the JSON body — use whichever suits your frontend (cookie-based is more secure; bearer token is easier for mobile/SPA debugging).
- Protected routes accept either the cookie or an `Authorization: Bearer <token>` header.
- Admin-only routes additionally check `req.user.role === 'admin'`.

## 🪙 Pricing Logic (used in Orders)

- Tax: 5% of cart subtotal (`TAX_RATE` in `orderController.js`)
- Shipping: ₹99 flat, **free above ₹2000** subtotal (`SHIPPING_FLAT_RATE`)
- Adjust these constants to match your real business rules.

## 🧪 Testing the API

Import the endpoints above into Postman/Insomnia, or use `curl`:
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test123"}'
```

---

## ✅ What's Next

Once you've confirmed the backend works for you, just say **"done"** and the React (MERN) frontend — product listing, cart, checkout with Stripe, user dashboard, and admin panel — will be built to match this exact API.
