const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Normalizes the admin product form (multipart/form-data) into a
 * Product-shaped req.body:
 *  - expands dotted keys ("dimensions.height" → { dimensions: { height } })
 *  - coerces "true"/"false" strings to booleans
 *  - parses the existingImages JSON field
 *  - writes uploaded image buffers to /uploads/products and appends their URLs
 * JSON requests (no files, no dotted keys) pass through unchanged.
 */
const parseProductForm = (req, res, next) => {
  const body = {};
  for (const [key, raw] of Object.entries(req.body || {})) {
    if (key === 'existingImages') continue;
    let value = raw;
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      body[parent] = body[parent] || {};
      body[parent][child] = value;
    } else {
      body[key] = value;
    }
  }

  let images;
  if (req.body && req.body.existingImages !== undefined) {
    try { images = JSON.parse(req.body.existingImages) || []; } catch { images = []; }
  }

  if (req.files && req.files.length) {
    images = images || [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `product-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
      images.push({ url: `/uploads/products/${filename}`, altText: body.name || 'Product image' });
    }
  }

  if (images !== undefined) body.images = images;
  req.body = body;
  next();
};

module.exports = parseProductForm;
