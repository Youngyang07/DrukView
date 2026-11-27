// Regenerate the app icons from the logo:  node scripts/make-icons.mjs
// "any" icons keep the rounded square; the maskable one is full-bleed with the mark inside the central 80%
// safe zone, because Android crops maskable icons to a circle or squircle of its own choosing.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const mark = (size, r, scale) => {
  const c = size / 2, ring = size * 0.219 * scale, stroke = size * 0.094 * scale;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="#8a1c2b"/>
    <circle cx="${c}" cy="${c}" r="${ring}" fill="none" stroke="#ffb400" stroke-width="${stroke}"/></svg>`);
};
mkdirSync('public/icons', { recursive: true });
const out = [
  ['public/icons/icon-192.png', 192, 192 * 0.22, 1],
  ['public/icons/icon-512.png', 512, 512 * 0.22, 1],
  ['public/icons/maskable-512.png', 512, 0, 0.8],
  ['src/app/apple-icon.png', 180, 0, 0.9], // iOS rounds the corners itself
];
for (const [file, size, r, scale] of out) await sharp(mark(size, r, scale)).png().toFile(file);
console.log(out.map(o => o[0]).join('\n'));
