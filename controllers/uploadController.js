const asyncHandler = require('express-async-handler');
const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');

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

  const result = await streamUpload(req.file.buffer, 'pottery-ecommerce/avatars');

  res.status(200).json({
    success: true,
    data: { url: result.secure_url, public_id: result.public_id },
  });
});

// @desc    Delete an uploaded image from Cloudinary
// @route   DELETE /api/v1/upload/:publicId
// @access  Private/Admin
exports.deleteImage = asyncHandler(async (req, res) => {
  const publicId = decodeURIComponent(req.params.publicId);
  await cloudinary.uploader.destroy(publicId);

  res.status(200).json({ success: true, message: 'Image deleted successfully.' });
});
