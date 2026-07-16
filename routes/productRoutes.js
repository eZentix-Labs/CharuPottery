const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  permanentlyDeleteProduct,
  getFeaturedProducts,
  getRelatedProducts,
  updateStock,
} = require('../controllers/productController');
const reviewRouter = require('./reviewRoutes');
const { protect, authorize } = require('../middleware/authMiddleware');
const { productValidation, validate } = require('../middleware/validators');
const upload = require('../middleware/uploadMiddleware');
const parseProductForm = require('../middleware/productFormMiddleware');

// Nested route: /api/v1/products/:productId/reviews
router.use('/:productId/reviews', reviewRouter);

router.get('/featured', getFeaturedProducts);
router.get('/:id/related', getRelatedProducts);

router
  .route('/')
  .get(getProducts)
  .post(
    protect,
    authorize('admin'),
    upload.array('images', 6),
    parseProductForm,
    productValidation,
    validate,
    createProduct
  );

router
  .route('/:idOrSlug')
  .get(getProduct);

router
  .route('/:id')
  .put(protect, authorize('admin'), upload.array('images', 6), parseProductForm, updateProduct)
  .delete(protect, authorize('admin'), deleteProduct);

router.delete(
  '/:id/permanent',
  protect,
  authorize('admin'),
  permanentlyDeleteProduct
);
router.patch('/:id/stock', protect, authorize('admin'), updateStock);

module.exports = router;
