import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

function pngSize(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  assert.equal(b.toString('ascii', 1, 4), 'PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function webpSize(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  throw new Error(`unsupported WEBP ${rel}`);
}

test('R6.6.4 preserves 23 selectable textured frames while upgrading their physical assets to UHD', () => {
  const frames = read('src/campfireWindowFrames.ts');
  const entries = [...frames.matchAll(/\{\s*id:\s*"([^"]+)"[\s\S]*?preview:\s*([^,}\n]+)/g)];
  const textured = entries.filter((m) => m[1] !== 'none');
  assert.equal(textured.length, 23, `expected 23 textured frames, got ${textured.length}`);
  assert.match(frames, /materialTop:/);
  assert.match(frames, /materialSide:/);
  const assetDir = path.join(root, 'src/assets/window-frames-uhd');
  const tops = fs.readdirSync(assetDir).filter((n) => n.endsWith('-top.webp'));
  const sides = fs.readdirSync(assetDir).filter((n) => n.endsWith('-side.webp'));
  assert.equal(tops.length, 23);
  assert.equal(sides.length, 23);
  for (const name of tops) { const { width, height } = webpSize(`src/assets/window-frames-uhd/${name}`); assert.ok(width >= 3840 && height >= 256); }
  for (const name of sides) { const { width, height } = webpSize(`src/assets/window-frames-uhd/${name}`); assert.ok(width >= 256 && height >= 1440); }
});

test('R6.6.3 makes the frame glow independent from the selected theme and keeps native controls readable', () => {
  const home = read('src/CampfireHome.tsx');
  const css = read('src/CampfireWindowFrames.css');
  const main = read('electron/main.mjs');
  assert.match(home, /--cf-window-frame-glow/);
  assert.match(home, /getCampfireWindowFrame\(activeWindowFrame\)\.glow/);
  assert.match(css, /var\(--cf-window-frame-glow/);
  assert.match(css, /\.campfireNativeTitlebar::after/);
  assert.match(css, /rgba\(0,0,0,\.(?:7|72)/);
  assert.match(main, /symbolColor:\s*['"]#(?:ffffff|f[0-9a-f]{5})['"]/i);
});

test('R6.6.4 uses real vitreous transparency so UHD theme art remains visible behind major panels and modals', () => {
  const themes = read('src/CampfireThemes.css');
  const shell = read('src/CampfireR6Shell.css');
  const catalog = read('src/campfireThemes.ts');
  assert.match(themes, /--cf-glass-alpha:\s*\.18/);
  assert.match(themes, /backdrop-filter:blur\(16px\)\s+saturate\(1\.55\)\s+brightness\(1\.08\)/);
  assert.match(shell, /\.blackPianoTheme \.modalOverlay[\s\S]{0,260}background:\s*rgb\(2 5 9 \/ \.10\)/);
  assert.match(catalog, /assets\/theme-backgrounds-uhd/);
  const themeDir = path.join(root, 'src/assets/theme-backgrounds-uhd');
  const webps = fs.readdirSync(themeDir).filter((n) => n.endsWith('.webp'));
  assert.equal(webps.length, 23);
  for (const name of webps) { const { width, height } = webpSize(`src/assets/theme-backgrounds-uhd/${name}`); assert.ok(width >= 2560 && height >= 1440, `${name} is not UHD enough`); }
});

test('R6.6.3 repairs create_campfire_r2 without depending on gen_random_bytes', () => {
  const migration = read('supabase/migrations/20260909203000_fix_create_campfire_r2_random.sql');
  assert.match(migration, /create or replace function public\.create_campfire_r2/);
  assert.doesNotMatch(migration, /v_invite_code[^\n]*gen_random_bytes\s*\(/i);
  assert.match(migration, /gen_random_uuid\s*\(\)/i);
  assert.match(migration, /pg_get_functiondef/);
});
