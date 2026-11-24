const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { detectType } = require('../utils/fileSignature');

const ROOT = path.join(__dirname, '..', 'uploads');

/**
 * Store an uploaded buffer locally after verifying its real type.
 * @param {Buffer} buffer
 * @param {{folder: string, allow: ('image'|'video')[], maxImageBytes?: number, maxVideoBytes?: number, prefix?: string}} opts
 * @returns {{url, public_id, kind, mime, size}}
 */
function storeLocal(buffer, { folder, allow, maxImageBytes = 8 * 1024 * 1024, maxVideoBytes = 25 * 1024 * 1024, prefix = 'file' }) {
  const t = detectType(buffer);
  if (!t || !allow.includes(t.kind)) throw new ApiError('Unsupported or corrupted file. Please upload a valid image' + (allow.includes('video') ? ' or video.' : '.'), 400);
  if (t.kind === 'image' && buffer.length > maxImageBytes) throw new ApiError(`Images must be at most ${Math.round(maxImageBytes / 1048576)} MB.`, 400);
  if (t.kind === 'video' && buffer.length > maxVideoBytes) throw new ApiError(`Videos must be at most ${Math.round(maxVideoBytes / 1048576)} MB.`, 400);
  const dir = path.join(ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${t.ext}`;
  fs.writeFileSync(path.join(dir, name), buffer, { flag: 'wx' });
  return { url: `/uploads/${folder}/${name}`, public_id: name, kind: t.kind, mime: t.mime, size: buffer.length };
}

module.exports = { storeLocal, UPLOAD_ROOT: ROOT };
