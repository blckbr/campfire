import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('R6.6.6.6 keeps a visible Settings button in the Home account area', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /className="campfireTopbarAccount"[\s\S]*title="Configurações"[\s\S]*setShowSettings\(true\)/);
});

test('R6.6.6.6 routes unrestricted Campfire AI queries through desktop live assistant', () => {
  const home = read('src/CampfireHome.tsx');
  const desktop = read('src/desktop.ts');
  const main = read('electron/main.mjs');
  assert.match(home, /askCampfireAssistant/);
  assert.match(home, /Pesquise o que quiser|Pergunte o que quiser/);
  assert.doesNotMatch(home, /buildCampfireAiReply/);
  assert.match(desktop, /assistant:\s*\{/);
  assert.match(main, /campfire:assistant-query/);
  assert.match(main, /geocoding-api\.open-meteo\.com/);
  assert.match(main, /api\.open-meteo\.com\/v1\/forecast/);
});

test('R6.6.6.6 fetches news in Electron directly without AllOrigins and refreshes every five minutes', () => {
  const home = read('src/CampfireHome.tsx');
  const desktop = read('src/desktop.ts');
  const main = read('electron/main.mjs');
  assert.match(home, /getCampfireNews/);
  assert.match(home, /5\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(home, /allorigins/i);
  assert.match(desktop, /news:\s*\{/);
  assert.match(main, /campfire:news-feed/);
  assert.match(main, /news\.google\.com\/rss/);
  assert.doesNotMatch(main, /allorigins/i);
});

test('R6.6.6.6 news feed is image-forward, clickable and vertically scrollable', () => {
  const home = read('src/CampfireHome.tsx');
  const css = read('src/CampfireR6Shell.css');
  assert.match(home, /campfireHomeNewsFeatured/);
  assert.match(home, /campfireHomeNewsThumb/);
  assert.match(home, /openUrl\(item\.url\)|openUrl\(campfireNews\[0\]\.url\)/);
  assert.match(css, /campfireHomeNewsFeed[^}]*overflow-y\s*:\s*auto/);
});

test('R6.6.6.6 removes themes, frames and marshmallow suggestions from Settings', () => {
  const settings = read('src/CampfireSettingsModal.tsx');
  assert.doesNotMatch(settings, /CampfireThemePicker/);
  assert.doesNotMatch(settings, /CAMPFIRE_WINDOW_FRAMES/);
  assert.doesNotMatch(settings, /Texturas Marshmallow/);
  assert.doesNotMatch(settings, /Gem &amp; Glow/);
  assert.doesNotMatch(settings, /"themes"|"frames"/);
  assert.doesNotMatch(settings, /Aparência e texturas/);
  const home = read('src/CampfireHome.tsx');
  assert.doesNotMatch(home, /CampfireThemePicker/);
  assert.doesNotMatch(home, /Tema desta Campfire/);
});
