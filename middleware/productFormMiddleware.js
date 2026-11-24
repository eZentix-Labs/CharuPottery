const { storeLocal } = require('../services/mediaStorage');

/**
 * Normalizes the admin product form (multipart/form-data) into a
 * Product-shaped req.body:
 *  - expands dotted keys ("dimensions.height" → { dimensions: { height } })
 *  - coerces "true"/"false" strings to booleans
 *  - parses the existingImages JSON field (only local/https URLs are kept)
 *  - stores uploaded images after verifying their real type by content
 * JSON requests (no files, no dotted keys) pass through unchanged.
 */
const SAFE_URL = /^(\/uploads\/|https:\/\/)/;

const parseProductForm = (req, res, next) => {
  try {
    const body = {};
    for (const [key, raw] of Object.entries(req.body || {})) {
      if (key === 'existingImages') continue;
      let value = raw;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        if (['__proto__', 'constructor', 'prototype'].includes(parent) || ['__proto__', 'constructor', 'prototype'].includes(child)) continue;
        body[parent] = body[parent] || {};
        body[parent][child] = value;
      } else {
        body[key] = value;
      }
    }

    let images;
    if (req.body && req.body.existingImages !== undefined) {
      try {
        const parsed = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
        images = (Array.isArray(parsed) ? parsed : [])
          .filter((i) => i && typeof i.url === 'string' && SAFE_URL.test(i.url))
          .map((i) => ({ url: i.url, public_id: i.public_id, altText: String(i.altText || '').slice(0, 150) }));
      } catch {
        images = [];
      }
    }

    if (req.files && req.files.length) {
      images = images || [];
      for (const file of req.files) {
        const stored = storeLocal(file.buffer, { folder: 'products', allow: ['image'], prefix: 'product' });
        images.push({ url: stored.url, public_id: stored.public_id, altText: String(body.name || 'Product image').slice(0, 150) });
      }
    }

    if (images !== undefined) body.images = images.slice(0, 10);
    req.body = body;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = parseProductForm;
