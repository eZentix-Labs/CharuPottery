const express = require('express');
const c = require('../controllers/contentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();
const admin = [protect, authorize('admin')];

router.get('/brand', c.getBrand);
router.get('/banners', c.getActiveBanners);
router.get('/offers', c.getPublicOffers);

router.put('/brand', ...admin, c.updateBrand);
router.post('/media', ...admin, upload.single('image'), c.uploadContentImage);
router.get('/admin/banners', ...admin, c.listBanners);
router.post('/admin/banners', ...admin, c.createBanner);
router.put('/admin/banners/:id', ...admin, c.updateBanner);
router.delete('/admin/banners/:id', ...admin, c.deleteBanner);

module.exports = router;
