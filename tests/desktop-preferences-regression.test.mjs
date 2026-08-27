import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const desktop = fs.readFileSync(new URL('../src/desktop.ts', import.meta.url), 'utf8');

test('desktop preferences own UI scale, locale, remembered close behavior and tray', () => {
  for (const token of [
    'Tray', 'screen', "desktop:get-preferences", "desktop:update-preferences", "desktop:close-action",
    'setZoomFactor', 'closeBehavior', 'windowBounds', "mainWindow.on('close'", 'ensureTray', 'hideAnimeViewsForClosePrompt', 'restoreAnimeViewsAfterClosePrompt',
  ]) assert.match(main, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(preload, /campfire:close-request/);
  assert.match(preload, /Apagar a fogueira/);
  assert.match(preload, /Só vou buscar mais lenha/);
  assert.match(preload, /Trocar de aventureiro/);
  assert.match(preload, /Foi mal, cliquei no X/);
  assert.match(desktop, /getDesktopPreferences/);
  assert.match(desktop, /updateDesktopPreferences/);
});
