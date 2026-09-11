import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('src/CampfireHome.tsx','utf8');
const css = fs.readFileSync('src/CampfireR4Shell.css','utf8');

test('R4 switches between a cinematic home topbar and compact room topbar', () => {
  assert.match(home, /campfireModeHome/);
  assert.match(home, /campfireModeRoom/);
  assert.match(home, /campfireTopbarBrand/);
  assert.match(home, /campfireTopbarNav/);
  assert.match(home, /campfireTopbarSearch/);
  assert.match(home, /Pesquisar Campfires/);
  assert.match(css, /\.campfireModeHome\s+\.topbar[^}]*grid-template-columns/s);
});

test('R4 home search filters the Campfire cards rather than being decorative', () => {
  assert.match(home, /homeSearch/);
  assert.match(home, /visibleCampfires/);
  assert.match(home, /room\.name\.toLocaleLowerCase\("pt-BR"\)\.includes\(normalizedHomeSearch\)/);
});
