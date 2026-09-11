import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (p) => fs.readFileSync(p, 'utf8');
const main = read('electron/main.mjs');
const frameCss = read('src/CampfireWindowFrames.css');
const themesCss = read('src/CampfireThemes.css');
const themePickerCss = read('src/CampfireThemePicker.css');
const themePicker = read('src/CampfireThemePicker.tsx');
const themes = read('src/campfireThemes.ts');
const home = read('src/CampfireHome.tsx');
const r6Shell = read('src/CampfireR6Shell.css');
const desktop = read('src/desktop.ts');

const themeIds = [
  'black-piano-glow','silver-glow','emerald-glow','blood-red-glow','topaz-glow',
  'white-marshmallow-glow','toasted-marshmallow-glow','color-marshmallow-glow',
  'electric-sapphire','neon-amethyst','onyx-glow','royal-ruby','golden-amber',
  'jade-frost','lunar-pearl','copper-lux','blue-obsidian','crystal-rose','polar-ice',
  'lavender-dream','caramel-glow','pink-marshmallow','night-marshmallow',
];

test('R6.6.2 lets the material show through the complete native title/control overlay', () => {
  assert.match(main, /titleBarStyle:\s*['"]hidden['"]/);
  assert.match(main, /titleBarOverlay:\s*\{[\s\S]{0,180}color:\s*['"](?:#00000000|rgba\(0,\s*0,\s*0,\s*0\))['"]/);
  assert.match(main, /titleBarOverlay:\s*\{[\s\S]{0,220}height:\s*34/);
  assert.match(frameCss, /--cf-window-frame-top-thickness:\s*34px/);
  assert.match(frameCss, /\.campfireNativeTitlebar::before[\s\S]{0,420}(?:inset:\s*0|height:\s*100%)/);
  assert.match(frameCss, /border-bottom:\s*0/);
});

test('R6.6.2 uses raster material assets for every one of the 23 themes', () => {
  for (const id of themeIds) {
    assert.match(themes, new RegExp(`id:\\s*["']${id}["'][\\s\\S]{0,220}texture:`), `${id} missing texture property`);
  }
  const textureMentions = (themes.match(/assets\/theme-backgrounds-uhd\//g) || []).length;
  assert.ok(textureMentions >= 23, `expected >=23 raster texture references, got ${textureMentions}`);
  assert.match(themePicker, /backgroundImage:\s*`url\("\$\{theme\.thumbnail\}"\)`/);
});

test('R6.6.2 removes fake stripe/facet fallbacks from the theme system', () => {
  for (const source of [themesCss, themePickerCss]) {
    assert.doesNotMatch(source, /repeating-linear-gradient/i);
    assert.doesNotMatch(source, /repeating-radial-gradient/i);
    assert.doesNotMatch(source, /conic-gradient/i);
  }
  assert.doesNotMatch(themesCss, /--cf-material-grain/);
  assert.match(themesCss, /--cf-theme-background-texture:\s*var\(--cf-active-theme-texture\)/);
});

test('R6.6.2 restores the animated call waveform in an imported stylesheet', () => {
  assert.match(home, /className="campfireSpotlightWave"/);
  assert.match(r6Shell, /\.campfireSpotlightWave\s*\{/);
  assert.match(r6Shell, /animation:\s*campfireWave/);
  assert.match(r6Shell, /@keyframes\s+campfireWave/);
});

test('R6.6.2 exempts official Supabase OAuth from the external-link confirmation', () => {
  assert.equal(fs.existsSync('src/campfireExternalLinkPolicy.ts'), true, 'missing external-link policy');
  const policy = read('src/campfireExternalLinkPolicy.ts');
  assert.match(policy, /shouldConfirmExternalUrl/);
  assert.match(policy, /\/auth\/v1\/authorize/);
  assert.match(desktop, /shouldConfirmExternalUrl/);
  assert.doesNotMatch(desktop, /if \(preferences\.confirmExternalLinks\) \{\s*const accepted = window\.confirm/);
});

test('R6.6.2 normal launcher uses production dist instead of Vite dev startup', () => {
  assert.equal(fs.existsSync('ABRIR_CAMPFIRE_R6_6_6_15.bat'), true, 'missing production launcher');
  const launcher = read('ABRIR_CAMPFIRE_R6_6_6_15.bat');
  assert.match(launcher, /electron\\dist\\electron\.exe/i);
  assert.doesNotMatch(launcher, /electron:dev|npm run dev:web|\bvite\b/i);
});
