const express = require('express');
const c = require('../controllers/productController');
const reviewRouter = require('./reviewRoutes');
const { protect, authorize, optionalAuth } = require('../middleware/authMiddleware');
const { productValidation, validate } = require('../middleware/validators');
const upload = require('../middleware/uploadMiddleware');
const parseProductForm = require('../middleware/productFormMiddleware');

const router = express.Router();
const admin = [protect, authorize('admin')];

// Nested route: /api/v1/products/:productId/reviews
router.use('/:productId/reviews', reviewRouter);

router.get('/featured', c.getFeaturedProducts);
router.get('/new-arrivals', c.getNewArrivals);
router.get('/admin/all', ...admin, c.getAdminProducts);
router.get('/:id/related', c.getRelatedProducts);

router
  .route('/')
  .get(c.getProducts)
  .post(...admin, upload.array('images', 6), parseProductForm, productValidation, validate, c.createProduct);

router.get('/:idOrSlug', optionalAuth, c.getProduct);

router
  .route('/:id')
  .put(...admin, upload.array('images', 6), parseProductForm, c.updateProduct)
  .delete(...admin, c.deleteProduct);

router.delete('/:id/permanent', ...admin, c.permanentlyDeleteProduct);
router.patch('/:id/stock', ...admin, c.updateStock);
router.post('/:id/stock-adjustments', ...admin, c.adjustStock);
router.get('/:id/stock-movements', ...admin, c.getStockMovements);

module.exports = router;
