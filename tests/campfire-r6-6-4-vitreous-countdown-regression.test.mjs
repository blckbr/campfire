import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

function webpDimensions(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`Unsupported WEBP chunk ${chunk} in ${file}`);
}

test('R6.6.4 ships 23 genuinely high-resolution theme backgrounds and frame atlases', () => {
  const themes = read('campfireThemes.ts');
  const frames = read('campfireWindowFrames.ts');
  assert.match(themes, /theme-backgrounds-uhd\//);
  assert.match(frames, /window-frames-uhd\//);

  const themeDir = path.join(src, 'assets', 'theme-backgrounds-uhd');
  const frameDir = path.join(src, 'assets', 'window-frames-uhd');
  const themeFiles = fs.readdirSync(themeDir).filter((n) => n.endsWith('.webp'));
  const topFiles = fs.readdirSync(frameDir).filter((n) => n.endsWith('-top.webp'));
  const sideFiles = fs.readdirSync(frameDir).filter((n) => n.endsWith('-side.webp'));
  assert.equal(themeFiles.length, 23);
  assert.equal(topFiles.length, 23);
  assert.equal(sideFiles.length, 23);
  for (const name of themeFiles) {
    const { width, height } = webpDimensions(path.join(themeDir, name));
    assert.ok(width >= 2560 && height >= 1440, `${name} is only ${width}x${height}`);
  }
  for (const name of topFiles) {
    const { width, height } = webpDimensions(path.join(frameDir, name));
    assert.ok(width >= 3840 && height >= 256, `${name} is only ${width}x${height}`);
  }
  for (const name of sideFiles) {
    const { width, height } = webpDimensions(path.join(frameDir, name));
    assert.ok(width >= 256 && height >= 1440, `${name} is only ${width}x${height}`);
  }
});

test('R6.6.4 keeps the selected theme visible under truly vitreous chrome', () => {
  const themesCss = read('CampfireThemes.css');
  const shellCss = read('CampfireR6Shell.css');
  assert.match(themesCss, /--cf-glass-alpha:\.18/);
  assert.match(themesCss, /backdrop-filter:blur\(16px\) saturate\(1\.55\) brightness\(1\.08\)/);
  assert.match(shellCss, /\.blackPianoTheme \.main\{[\s\S]*?background:transparent!important/);
  assert.match(shellCss, /\.blackPianoTheme \.content\{[\s\S]*?background:transparent!important/);
  assert.match(shellCss, /\.blackPianoTheme footer\{[\s\S]*?background:rgb\(5 8 12 \/ \.34\)!important/);
});

test('R6.6.4 uses independent UHD top and side frame textures without stretching one image', () => {
  const frames = read('campfireWindowFrames.ts');
  const home = read('CampfireHome.tsx');
  const css = read('CampfireWindowFrames.css');
  assert.match(frames, /materialTop:/);
  assert.match(frames, /materialSide:/);
  assert.match(home, /--cf-window-frame-top-image/);
  assert.match(home, /--cf-window-frame-side-image/);
  assert.match(css, /background-image:var\(--cf-window-frame-top-image\)/);
  assert.match(css, /background-image:var\(--cf-window-frame-side-image\),var\(--cf-window-frame-side-image\)/);
  assert.doesNotMatch(css, /background-size:cover/);
  assert.match(css, /background-size:var\(--cf-window-frame-side-thickness\) 100%,var\(--cf-window-frame-side-thickness\) 100%/);
});

test('R6.6.4 lowers the whole left-room status card and renders a large 24-style traffic-light countdown', () => {
  const home = read('CampfireHome.tsx');
  const countdown = read('CampfireExpiryCountdown.tsx');
  const css = read('CampfireR6Shell.css');
  assert.match(home, /campfireInactiveCard campfireInactiveCard--left/);
  assert.match(css, /\.campfireInactiveCard--left\{[\s\S]*?transform:translateY\(8vh\)/);
  assert.match(countdown, /remainingSeconds <= 60/);
  assert.match(countdown, /remainingSeconds <= 240/);
  assert.match(countdown, /campfireExpiryCountdown--red/);
  assert.match(countdown, /campfireExpiryCountdown--yellow/);
  assert.match(countdown, /campfireExpiryCountdown--green/);
  assert.match(css, /font-family:"Twenty Four"/);
  assert.match(css, /font-size:clamp\(68px,7vw,116px\)/);
  assert.match(countdown, /document\.fonts\.check/);
  assert.match(countdown, /measureText/);
  assert.match(countdown, /campfireTwentyFourSegments/);
  assert.match(css, /\.campfireTwentyFourSegment--a/);
});
