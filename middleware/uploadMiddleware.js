const multer = require('multer');
const ApiError = require('../utils/ApiError');

/**
 * Multer configurations (memory storage; files are validated by content
 * signature in utils/fileSignature.js before anything is written to disk).
 */
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const filter = (allowed, label) => (req, file, cb) => {
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new ApiError(`Only ${label} files are allowed`, 400), false);
};

// Product / avatar images: 8 MB each
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: filter(IMAGE_TYPES, 'JPG, PNG and WEBP image'),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
});

// Customer review media: images ≤ 5 MB, videos ≤ 25 MB (enforced per type later)
const reviewMediaUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: filter([...IMAGE_TYPES, ...VIDEO_TYPES], 'JPG, PNG, WEBP, MP4, WEBM or MOV'),
  limits: { fileSize: 25 * 1024 * 1024, files: 4 },
});

module.exports = upload;
module.exports.reviewMediaUpload = reviewMediaUpload;
module.exports.IMAGE_TYPES = IMAGE_TYPES;
