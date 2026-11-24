const mongoose = require('mongoose');
const slugify = require('slugify');

const dimensionSchema = new mongoose.Schema(
  {
    height: { type: Number }, // cm
    width: { type: Number }, // cm
    diameter: { type: Number }, // cm
    weight: { type: Number }, // grams
  },
  { _id: false }
);

const reviewRefSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: Number,
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [120, 'Product name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
    },
    shortDescription: {
      type: String,
      maxlength: [200, 'Short description cannot exceed 200 characters'],
    },

    // Pricing
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountPrice: {
      type: Number,
      min: [0, 'Discount price cannot be negative'],
      validate: {
        validator: function (value) {
          return value == null || value < this.price;
        },
        message: 'Discount price must be less than the regular price',
      },
    },
    currency: {
      type: String,
      default: 'INR',
    },

    // Categorization
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    tags: [{ type: String, trim: true, lowercase: true }],

    // Pottery / ceramics specific attributes
    clayType: {
      type: String,
      enum: [
        'Stoneware',
        'Earthenware',
        'Porcelain',
        'Terracotta',
        'Bone China',
        'Raku',
        'Other',
      ],
    },
    glazeType: { type: String, trim: true }, // e.g., "Matte White Glaze", "Celadon"
    firingTechnique: { type: String, trim: true }, // e.g., "Wood-fired", "Kiln-fired"
    technique: {
      type: String,
      enum: ['Wheel-thrown', 'Hand-built', 'Slip-cast', 'Coiled', 'Other'],
      default: 'Wheel-thrown',
    },
    color: [{ type: String, trim: true }],
    dimensions: dimensionSchema,
    careInstructions: {
      type: String,
      default:
        'Hand wash recommended. Avoid sudden temperature changes. Not microwave safe unless stated.',
    },
    isMicrowaveSafe: { type: Boolean, default: false },
    isDishwasherSafe: { type: Boolean, default: false },
    isFoodSafe: { type: Boolean, default: true },

    // Origin / artisan story — important for handmade marketplaces
    isHandmade: { type: Boolean, default: true },
    artisan: {
      name: { type: String, trim: true },
      bio: { type: String },
      location: { type: String },
    },
    madeToOrder: { type: Boolean, default: false },
    processingTime: { type: String, default: '3-5 business days' },

    // Media
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String },
        altText: { type: String, default: '' },
      },
    ],

    // Inventory
    sku: {
      type: String,
      unique: true,
      sparse: true,
    },
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    // Units held for unpaid online checkouts (not available, not yet sold).
    // Changed only by services/inventory.js together with an InventoryMovement.
    reservedStock: {
      type: Number,
      min: [0, 'Reserved stock cannot be negative'],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },

    // Reviews / Ratings (aggregated; full reviews live in Review collection)
    ratingsAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: (val) => Math.round(val * 10) / 10,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },

    // Flags
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isNewArrival: { type: Boolean, default: false },

    // Stats
    soldCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Generate unique slug + SKU
productSchema.pre('save', async function (next) {
  if (this.isModified('name') || this.isNew) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    const Product = this.constructor;
    while (await Product.findOne({ slug, _id: { $ne: this._id } })) {
      count += 1;
      slug = `${baseSlug}-${count}`;
    }
    this.slug = slug;
  }

  if (!this.sku) {
    this.sku = `POT-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  next();
});

// Virtual: effective price (discount if available)
productSchema.virtual('finalPrice').get(function () {
  return this.discountPrice && this.discountPrice > 0
    ? this.discountPrice
    : this.price;
});

// Virtual: in-stock status
productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Indexes for search & filtering performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isNewArrival: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
