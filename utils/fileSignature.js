/**
 * Detect a file's real type from its first bytes. The client-supplied
 * mimetype and filename extension are never trusted for storage.
 */
function detectType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg', kind: 'image' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png', kind: 'image' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: '.webp', kind: 'image' };
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (/^(isom|iso2|mp41|mp42|avc1|M4V |dash)/.test(brand)) return { mime: 'video/mp4', ext: '.mp4', kind: 'video' };
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: '.mov', kind: 'video' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'video/webm', ext: '.webm', kind: 'video' };
  return null;
}

module.exports = { detectType };
