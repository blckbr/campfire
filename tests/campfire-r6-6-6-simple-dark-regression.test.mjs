import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'src');
const read = (name) => fs.readFileSync(path.join(src, name), 'utf8');

test('R6.6.6 locks the shell to one simple dark visual mode with no textured frame', () => {
  const home = read('CampfireHome.tsx');
  assert.match(home, /data-campfire-theme="black-piano-glow"/);
  assert.match(home, /data-campfire-frame="none"/);
  assert.match(home, /"--cf-window-frame-top-image":\s*"none"/);
  assert.match(home, /"--cf-window-frame-side-image":\s*"none"/);
});

test('R6.6.6 uses the approved restrained dark chrome instead of theme art', () => {
  const css = read('CampfireR6Shell.css');
  assert.match(css, /R6\.6\.6 — SIMPLE DARK REFERENCE MODE/);
  assert.match(css, /--cf-simple-teal:\s*#27d9c4/);
  assert.match(css, /--cf-simple-amber:\s*#d99a4e/);
  assert.match(css, /background-image:\s*none\s*!important/);
  assert.match(css, /\.blackPianoMenuBar\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /button\[aria-label="Tema desta Campfire"\][^{]*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.campfireThemePopover\s*\{[^}]*display:\s*none\s*!important/s);
});

test('R6.6.6 keeps the reference-like three-column room and restrained cards', () => {
  const css = read('CampfireR6Shell.css');
  assert.match(css, /--cf-left-rail-default:\s*288px/);
  assert.match(css, /--cf-right-rail-default:\s*320px/);
  assert.match(css, /\.campfireStageMockup\s*\{[^}]*grid-template-columns:\s*minmax\(0,1\.7fr\)\s+minmax\(260px,\.8fr\)/s);
  assert.match(css, /\.campfireSpotlightPrimary\s*\{[^}]*background:\s*#0d141b\s*!important/s);
});

test('R6.6.6 settings also follows the same simple dark language', () => {
  const css = read('CampfireSettingsModal.css');
  assert.match(css, /R6\.6\.6 simple dark settings/);
  assert.match(css, /background:\s*#0b1117\s*!important/);
  assert.match(css, /color:\s*#eef3f6\s*!important/);
});


test('R6.6.6 removes themes and textured-frame navigation from settings', () => {
  const settings = read('CampfireSettingsModal.tsx');
  assert.doesNotMatch(settings, /onClick=\{\(\) => setActiveTab\("themes"\)\}/);
  assert.doesNotMatch(settings, /onClick=\{\(\) => setActiveTab\("frames"\)\}/);
});
