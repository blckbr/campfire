import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('src/CampfireHome.tsx');
const themes = read('src/CampfireThemes.css');
const r6 = read('src/CampfireR6Shell.css');
const picker = read('src/CampfireThemePicker.tsx');
const pickerCss = read('src/CampfireThemePicker.css');
const pkg = JSON.parse(read('package.json'));
const main = read('electron/main.mjs');
const splash = read('public/splash.html');
const manifest = read('public/manifest.webmanifest');

test('R6.3 program identity is Campfire only; Black Piano remains a theme name rather than the product name', () => {
  assert.equal(pkg.productName, 'Campfire');
  assert.equal(pkg.build.productName, 'Campfire');
  assert.equal(pkg.build.nsis.shortcutName, 'Campfire');
  assert.match(pkg.build.win.artifactName, /^Campfire-Setup-/);
  assert.doesNotMatch(home, /Campfire Black Piano/);
  assert.doesNotMatch(home, />BLACK PIANO</);
  assert.match(home, /<h2>Campfire<\/h2>/);
  assert.match(main, /title:\s*'Campfire'/);
  assert.doesNotMatch(splash, /Black Piano Alpha/);
  assert.doesNotMatch(manifest, /Campfire Black Piano/);
});

test('R6.3 room has an explicit Dashboard return path via logo, Inicio button and Alt+Left', () => {
  assert.match(home, /function returnToDashboard\(\)/);
  assert.match(home, /setSelectedCampfireId\(null\)/);
  assert.match(home, /className="campfireRoomHomeBrand"/);
  assert.match(home, /title="Voltar ao Início"/);
  assert.match(home, /className="campfireReturnHomeButton"/);
  assert.match(home, />⌂ Início<\/button>/);
  assert.match(home, /event\.altKey\s*&&\s*event\.key\s*===\s*"ArrowLeft"/);
  assert.match(home, /event\.preventDefault\(\)/);
  assert.match(r6, /\.campfireRoomHomeBrand/);
  assert.match(r6, /\.campfireReturnHomeButton/);
});

test('R6.3 theme material metadata remains available for previews while R6.4 reserves physical texture for window frames', () => {
  const ids = [
    'black-piano-glow','silver-glow','emerald-glow','blood-red-glow','topaz-glow',
    'white-marshmallow-glow','toasted-marshmallow-glow','color-marshmallow-glow',
    'electric-sapphire','neon-amethyst','onyx-glow','royal-ruby','golden-amber','jade-frost',
    'lunar-pearl','copper-lux','blue-obsidian','crystal-rose','polar-ice','lavender-dream',
    'caramel-glow','pink-marshmallow','night-marshmallow',
  ];
  for (const id of ids) {
    assert.match(themes, new RegExp(`data-campfire-theme="${id}"[^}]*--cf-material-texture:`));
  }
  assert.match(themes, /--cf-glass-rgb:/);
  assert.match(themes, /--cf-glass-alpha:\s*\.50/);
  assert.doesNotMatch(themes, /Global chrome compositor:[\s\S]*background-image:\s*var\(--cf-material-texture\)/);
  assert.match(r6, /backdrop-filter:\s*blur\(24px\)\s+saturate\(1\.25\)/);
});

test('R6.3 theme picker previews the actual raster texture selected by the theme', () => {
  assert.match(picker, /data-theme-preview=\{theme\.id\}/);
  assert.match(picker, /backgroundImage:\s*`url\("\$\{theme\.thumbnail\}"\)`/);
  assert.match(pickerCss, /i\[data-theme-preview\]/);
  assert.doesNotMatch(pickerCss, /repeating-linear-gradient|repeating-radial-gradient|conic-gradient/);
});
