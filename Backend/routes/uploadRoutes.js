const express = require('express');
const router = express.Router();
const {
  uploadProductImages,
  uploadAvatar,
  deleteImage,
} = require('../controllers/uploadController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post(
  '/products',
  protect,
  authorize('admin'),
  upload.array('images', 6),
  uploadProductImages
);

router.post('/avatar', protect, upload.single('avatar'), uploadAvatar);

router.delete('/:publicId', protect, authorize('admin'), deleteImage);

module.exports = router;
