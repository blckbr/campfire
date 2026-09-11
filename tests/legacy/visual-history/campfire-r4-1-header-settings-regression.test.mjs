import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../src/CampfireHome.tsx', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../src/CampfireVoiceDock.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/CampfireR4Shell.css', import.meta.url), 'utf8');
const themes = fs.readFileSync(new URL('../src/CampfireThemes.css', import.meta.url), 'utf8');

test('R4.1 theme material reaches both top menu rows with a visible Aero edge', () => {
  assert.match(themes, /--cf-chrome-surface\s*:/, 'theme tokens need a dedicated chrome surface');
  assert.match(css, /\.blackPianoTheme \.blackPianoMenuBar[\s\S]*background:\s*var\(--cf-chrome-surface\)\s*!important/, 'menu bar must use theme chrome material');
  assert.match(css, /\.blackPianoTheme \.topbar[\s\S]*background:\s*var\(--cf-chrome-surface\)\s*!important/, 'profile topbar must use theme chrome material');
  assert.match(css, /\.blackPianoTheme \.blackPianoMenuBar::after[\s\S]*box-shadow:[^;}]*var\(--cf-edge-bright\)/, 'top menu must expose a visible luminous edge');
  assert.match(css, /\.blackPianoTheme \.topbar::after[\s\S]*display:\s*block\s*!important/, 'topbar edge must override legacy display:none');
});

test('R4.1 settings use one outer scroll surface so 130 percent HUD can reach the final controls', () => {
  assert.match(css, /\.campfireSettingsModal\s*\{[\s\S]*height:\s*min\(88dvh,\s*920px\)\s*!important/, 'settings modal needs a definite viewport height');
  assert.match(css, /\.campfireSettingsBody\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)/, 'settings body must have a shrinkable row');
  assert.match(css, /\.campfireSettingsBody > main\s*\{[\s\S]*overflow-y:\s*auto\s*!important/, 'settings main must own vertical scrolling');
  assert.match(css, /\.campfireSettingsThemeSection \.campfireThemePicker\s*\{[\s\S]*max-height:\s*none\s*!important[\s\S]*overflow:\s*visible\s*!important/, 'theme grid must not trap the mouse wheel inside settings');
});

test('R4.1 quick actions and compact voice controls live inside the Campfire header', () => {
  const headerStart = home.indexOf('<div className="campfireRoomHeader">');
  assert.ok(headerStart >= 0, 'room header must exist');
  assert.ok(home.indexOf('campfireRoomHeaderControls', headerStart) > headerStart, 'continuous header controls host must exist');
  assert.ok(home.indexOf('campfireQuickActions', headerStart) < home.indexOf('{showThemePicker', headerStart), 'quick actions must be rendered in the header before the theme popover');
  assert.match(home, /<CampfireVoiceDock[\s\S]*variant="header"/, 'voice controls must be rendered in header variant');
  assert.equal((home.match(/<CampfireVoiceDock/g) || []).length, 1, 'large bottom voice dock must be removed');
  assert.match(voice, /variant\?:\s*"dock"\s*\|\s*"header"/, 'voice dock needs an explicit header variant');
  assert.match(voice, /headerCompact/, 'header variant needs a compact class');
  assert.match(css, /\.campfireVoiceDock\.headerCompact\s*\{[\s\S]*background:\s*transparent\s*!important/, 'compact voice controls must not draw a second floating panel');
});
