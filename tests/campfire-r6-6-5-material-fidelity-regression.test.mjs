import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  let off = 12;
  while (off + 8 <= buffer.length) {
    const type = buffer.toString('ascii', off, off + 4);
    const len = buffer.readUInt32LE(off + 4);
    const data = off + 8;
    if (type === 'VP8X') {
      const w = 1 + buffer[data + 4] + (buffer[data + 5] << 8) + (buffer[data + 6] << 16);
      const h = 1 + buffer[data + 7] + (buffer[data + 8] << 8) + (buffer[data + 9] << 16);
      return [w, h];
    }
    if (type === 'VP8 ') {
      const w = buffer.readUInt16LE(data + 6) & 0x3fff;
      const h = buffer.readUInt16LE(data + 8) & 0x3fff;
      return [w, h];
    }
    if (type === 'VP8L') {
      const b0 = buffer[data + 1], b1 = buffer[data + 2], b2 = buffer[data + 3], b3 = buffer[data + 4];
      const w = 1 + (((b2 & 0x3f) << 8) | b1);
      const h = 1 + (((b3 & 0xf) << 10) | (b2 >> 6) | (b3 & 0xf0) << 2);
      return [w, h];
    }
    off = data + len + (len & 1);
  }
  throw new Error('Unsupported WebP');
}

test('R6.6.5 theme picker exposes material image plus semantic copy, not tiny swatches', () => {
  const picker = read('src/CampfireThemePicker.tsx');
  const css = read('src/CampfireThemePicker.css');
  assert.match(picker, /campfireThemeCardPreview/);
  assert.match(picker, /theme\.description/);
  assert.match(css, /height:\s*118px/);
  assert.match(css, /backdrop-filter:\s*blur\(20px\)/);
});

test('R6.6.5 material names carry explicit appearance descriptions and Liquid Glass has a real preview', () => {
  const themes = read('src/campfireThemes.ts');
  const frames = read('src/campfireWindowFrames.ts');
  assert.match(themes, /description:\s*"Laca preta de piano/);
  assert.match(themes, /description:\s*"Pérola nacarada/);
  assert.match(themes, /description:\s*"Marshmallows reais/);
  assert.match(frames, /id:\s*"none"[\s\S]*preview:\s*thumb\("liquid-glass"\)/);
});

test('R6.6.5 settings appearance is genuinely vitreous and reveals active theme art', () => {
  const css = read('src/CampfireSettingsModal.css');
  assert.match(css, /R6\.6\.5 — MATERIAL FIDELITY \+ VITREOUS SETTINGS/);
  assert.match(css, /background:\s*linear-gradient\([^;]*var\(--cf-theme-background-texture\)/s);
  assert.match(css, /backdrop-filter:\s*blur\(28px\)\s+saturate\(1\.65\)/);
  assert.match(css, /\.campfireSettingsTextureGroup[\s\S]*rgba\(8,15,27,\.14\)/);
});

test('R6.6.5 ships 23 unique UHD themes, 23 frame top/side surfaces, and crisp previews', () => {
  const names = [
    'black-piano-glow','silver-glow','emerald-glow','blood-red-glow','topaz-glow','electric-sapphire','neon-amethyst','onyx-glow','royal-ruby','golden-amber','jade-frost','lunar-pearl','copper-lux','blue-obsidian','crystal-rose','polar-ice','lavender-dream','caramel-glow','color-marshmallow-glow','white-marshmallow-glow','toasted-marshmallow-glow','pink-marshmallow','night-marshmallow'
  ];
  const hashes = new Set();
  for (const name of names) {
    const bg = fs.readFileSync(path.join(root, 'src/assets/theme-backgrounds-uhd', `${name}.webp`));
    const top = fs.readFileSync(path.join(root, 'src/assets/window-frames-uhd', `${name}-top.webp`));
    const side = fs.readFileSync(path.join(root, 'src/assets/window-frames-uhd', `${name}-side.webp`));
    const preview = fs.readFileSync(path.join(root, 'src/assets/theme-previews', `${name}.webp`));
    const [bw,bh] = webpSize(bg); const [tw,th] = webpSize(top); const [sw,sh] = webpSize(side); const [pw,ph] = webpSize(preview);
    assert.ok(bw >= 3840 && bh >= 2160, `${name} background is not UHD`);
    assert.ok(tw >= 3840 && th >= 512, `${name} top frame is not UHD`);
    assert.ok(sw >= 512 && sh >= 2160, `${name} side frame is not UHD`);
    assert.ok(pw >= 720 && ph >= 420, `${name} preview is not crisp`);
    hashes.add(crypto.createHash('sha256').update(preview).digest('hex'));
  }
  assert.equal(hashes.size, 23, 'all 23 material previews must be visually distinct assets');
  const glass = fs.readFileSync(path.join(root, 'src/assets/window-frame-previews/liquid-glass.webp'));
  assert.ok(glass.length > 10000, 'Liquid Glass preview must be a real raster image');
});
