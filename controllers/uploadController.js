const fs = require('fs');
const path = require('path');
const asyncHandler = require('express-async-handler');
const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const streamUpload = (fileBuffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(fileBuffer);
  });
};

// @desc    Upload one or more product images
// @route   POST /api/v1/upload/products
// @access  Private/Admin
exports.uploadProductImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ApiError('Please attach at least one image.', 400);
  }

  const uploadPromises = req.files.map((file) =>
    streamUpload(file.buffer, 'pottery-ecommerce/products')
  );

  const results = await Promise.all(uploadPromises);

  const images = results.map((result) => ({
    url: result.secure_url,
    public_id: result.public_id,
  }));

  res.status(200).json({ success: true, data: images });
});

// @desc    Upload user avatar
// @route   POST /api/v1/upload/avatar
// @access  Private
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('Please attach an image.', 400);
  }

  // Store locally (Cloudinary is not configured) and persist on the user
  const ext = path.extname(req.file.originalname) || '.jpg';
  const filename = `avatar-${req.user.id}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), req.file.buffer);

  // Remove the previous locally-stored avatar file, if any
  const prev = req.user.avatar?.public_id;
  if (prev && prev.startsWith('avatar-')) {
    fs.rm(path.join(AVATAR_DIR, prev), { force: true }, () => {});
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: { url: `/uploads/avatars/${filename}`, public_id: filename } },
    { new: true }
  );

  res.status(200).json({ success: true, data: user });
});

// @desc    Delete an uploaded image from Cloudinary
// @route   DELETE /api/v1/upload/:publicId
// @access  Private/Admin
exports.deleteImage = asyncHandler(async (req, res) => {
  const publicId = decodeURIComponent(req.params.publicId);
  await cloudinary.uploader.destroy(publicId);

  res.status(200).json({ success: true, message: 'Image deleted successfully.' });
});
