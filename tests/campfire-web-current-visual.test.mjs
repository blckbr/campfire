import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const home = read('src/CampfireHome.tsx');
const shell = read('src/CampfireR6Shell.css');
const platform = read('src/web/platform.ts');
const app = read('src/App.tsx');

test('CampfireWeb reuses the approved R6.6.6.15 Simple Dark shell and fire identity', () => {
  assert.match(home, /CampfireR6Shell\.css/);
  assert.match(home, /CampfireRightRail/);
  assert.match(home, /campfireIcon/);
  assert.match(shell, /\.blackPianoTheme/);
  assert.doesNotMatch(`${home}\n${app}`, /Marshmallow Colorido|Galeria de temas|CampfireWindowFrames/i);
});

test('Web runtime is explicitly marked for browser-appropriate responsive behavior', () => {
  assert.match(platform, /installCampfireRuntimeMarker/);
  assert.match(platform, /dataset\.campfireRuntime/);
  assert.match(app, /installCampfireRuntimeMarker\(\)/);
  assert.match(shell, /data-campfire-runtime="web"/);
});

test('desktop-only workspace windows keep Web fallback semantics rather than DOM BrowserWindow emulation', () => {
  const desktop = read('src/desktop.ts');
  assert.match(desktop, /isCampfireDesktop/);
  assert.match(desktop, /window\.location|CustomEvent|dispatchEvent/);
  assert.doesNotMatch(platform, /BrowserWindow|ipcRenderer/);
});
