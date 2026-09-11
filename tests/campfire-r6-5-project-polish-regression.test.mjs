import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('src/CampfireHome.tsx');
const shell = read('src/CampfireR6Shell.css');
const frames = read('src/CampfireWindowFrames.css');
const settings = read('src/CampfireSettingsModal.tsx');
const anime = read('src/AnimeBrowser.tsx');
const desktop = read('src/desktop.ts');
const preload = read('electron/preload.cjs');
const main = read('electron/main.mjs');

test('R6.5 stretches the center workspace and keeps the right rail at the far edge', () => {
  assert.match(shell, /\.blackPianoTheme \.content\s*\{[^}]*display:\s*block\s*!important[^}]*width:\s*100%\s*!important[^}]*place-items:\s*stretch\s*!important/s);
  assert.match(shell, /\.campfireHomeShell\s*,\s*\.campfireRoomShell\s*\{[^}]*width:\s*100%\s*!important[^}]*max-width:\s*none\s*!important/s);
});

test('R6.6.2 textured frame fills the complete 34px title/control bar and side edges, never bottom', () => {
  assert.match(frames, /--cf-window-frame-top-thickness:\s*34px/);
  assert.match(frames, /--cf-window-frame-side-thickness:\s*6px/);
  assert.match(frames, /\.campfireNativeTitlebar::before[\s\S]*inset:\s*0/);
  assert.match(frames, /background-image:\s*var\(--cf-window-frame-top-image\)/);
  assert.match(frames, /background-image:var\(--cf-window-frame-side-image\),var\(--cf-window-frame-side-image\)/);
  assert.match(frames, /data-campfire-frame[^\n]*::after[\s\S]*left:\s*0[\s\S]*right:\s*0[\s\S]*top:\s*34px[\s\S]*bottom:\s*0/);
  assert.match(frames, /border-bottom:\s*0/);
  assert.doesNotMatch(frames, /mask-composite:\s*exclude/);
});

test('R6.5 settings navigation buttons are selectable instead of disabled placeholders', () => {
  for (const tab of ['notifications', 'privacy', 'connections', 'shortcuts', 'advanced']) {
    assert.match(settings, new RegExp(`activeTab === "${tab}"`));
    assert.match(settings, new RegExp(`setActiveTab\\("${tab}"\\)`));
  }
  assert.doesNotMatch(settings, /className="comingSoon"\s+disabled/);
});

test('R6.5 removes Electron native menu so Alt cannot reveal a second menu bar', () => {
  assert.match(main, /mainWindow\.setMenu\(null\)/);
  assert.match(main, /mainWindow\.setMenuBarVisibility\(false\)/);
});

test('R6.5 enlarges room action buttons and styles Create Campfire itself as glass', () => {
  assert.match(shell, /\.campfireQuickActionButton[^}]*width:\s*44px\s*!important[^}]*height:\s*44px\s*!important/s);
  assert.match(shell, /\.campfireRailCreateTop\s*>\s*\.campfireTopbarCreateButton[\s\S]*background:[^;]*var\(--cf-glass-surface/);
  assert.match(home, /className="campfireTopbarCreateButton"/);
});

test('R6.5 anime broadcast captures isolated player without forcing the Campfire window fullscreen', () => {
  const start = anime.indexOf('async function startAnimeBroadcast()');
  const stop = anime.indexOf('async function stopAnimeBroadcast()', start);
  assert.ok(start >= 0 && stop > start);
  const block = anime.slice(start, stop);
  assert.doesNotMatch(block, /setAnimeFullscreen\(\s*true\s*\)/);
  assert.match(block, /prepareAnimeWatchCapture\(\)/);
});

test('R6.5 player fullscreen uses native player-only fullscreen and restores on exit', () => {
  assert.match(preload, /setPlayerFullscreen:\s*\(label, enabled\)\s*=>\s*ipcRenderer\.invoke\('anime:set-player-fullscreen'/);
  assert.match(desktop, /setPlayerFullscreen\(enabled:\s*boolean\)/);
  assert.match(main, /ipcMain\.handle\('anime:set-player-fullscreen'/);
  assert.match(main, /isolateAnimePlayer/);
  assert.match(main, /restoreAnimePlayer/);
  assert.match(main, /before-input-event/);
});
