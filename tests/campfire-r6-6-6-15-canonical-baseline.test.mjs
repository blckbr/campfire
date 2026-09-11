import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('R6.6.6.15 keeps the approved current Simple Dark shell', () => {
  const home = read('src/CampfireHome.tsx');
  const shell = read('src/CampfireR6Shell.css');
  const desktop = read('src/desktop.ts');
  assert.match(home, /import "\.\/CampfireR6Shell\.css"/);
  assert.match(home, /className=\{`app blackPianoTheme/);
  assert.match(shell, /\.blackPianoTheme/);
  assert.match(desktop, /FIRE_OUT_EFFECT_VOLUME\s*=\s*0\.10/);
});

test('abandoned selectable themes and decorative frame UI stay inactive', () => {
  const home = read('src/CampfireHome.tsx');
  const main = read('src/main.tsx');
  assert.doesNotMatch(home, /Marshmallow Colorido|Galeria de temas|Selecionar tema/i);
  assert.doesNotMatch(home, /import .*CampfireWindowFrames\.css/);
  assert.doesNotMatch(main, /CampfireWindowFrames\.css/);
});

test('R6.6.6.15 preserves Settings Escape and ten-percent fire-out contracts', () => {
  const settings = read('src/CampfireSettingsModal.tsx');
  const desktop = read('src/desktop.ts');
  assert.match(settings, /event\.key !== "Escape"/);
  assert.match(settings, /recordingPushToTalk/);
  assert.match(desktop, /FIRE_OUT_EFFECT_VOLUME\s*=\s*0\.10/);
});
