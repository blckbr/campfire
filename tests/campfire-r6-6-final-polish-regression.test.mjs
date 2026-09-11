import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

const main = read('electron/main.mjs');
const home = read('src/CampfireHome.tsx');
const rightRail = read('src/CampfireRightRail.tsx');
const rightRailCss = read('src/CampfireRightRail.css');
const frameCss = read('src/CampfireWindowFrames.css');
const themesCss = read('src/CampfireThemes.css');
const themesTs = read('src/campfireThemes.ts');
const settings = read('src/CampfireSettingsModal.tsx');
const settingsCss = read('src/CampfireSettingsModal.css');

test('R6.6 owns the real top title bar where Campfire is written', () => {
  assert.match(main, /titleBarStyle:\s*['"]hidden['"]/);
  assert.match(main, /titleBarOverlay:/);
  assert.match(home, /className="campfireNativeTitlebar"/);
  assert.match(home, /campfireNativeTitlebar[\s\S]{0,300}>Campfire</);
  assert.match(frameCss, /\.campfireNativeTitlebar::before/);
  assert.match(frameCss, /border-bottom:\s*0/);
});

test('R6.6 moves the quote card into the full-width 156px bottom of the right rail', () => {
  assert.doesNotMatch(home, /<aside[\s\S]{0,120}className="campfireMoodCard campfireMoodMockup"/);
  assert.match(rightRail, /moodCoverUrl/);
  assert.match(rightRail, /className="campfireRightRailMood"/);
  assert.match(rightRailCss, /\.campfireRightRailMood[\s\S]{0,500}height:\s*156px/);
  assert.match(rightRailCss, /\.campfireRightRailMood[\s\S]{0,500}width:\s*100%/);
});

test('R6.6 settings utility pages contain persisted working controls, not text-only placeholders', () => {
  assert.match(settings, /loadCampfireAppPreferences/);
  assert.match(settings, /saveCampfireAppPreferences/);
  assert.match(settings, /requestSystemNotificationPermission/);
  assert.match(settings, /testSupabaseConnection/);
  assert.match(settings, /resetCampfireLayout/);
  assert.match(settings, /campfireSettingsToggleRow/);
  assert.match(settingsCss, /\.campfireSettingsToggleRow/);
});

test('R6.6.2 makes every theme a real raster material visible through translucent glass', () => {
  assert.match(themesTs, /assets\/theme-backgrounds-uhd\/color-marshmallow-glow\.webp/);
  assert.ok((themesTs.match(/assets\/theme-backgrounds-uhd\//g) || []).length >= 23);
  assert.match(themesCss, /--cf-theme-background-texture:\s*var\(--cf-active-theme-texture\)/);
  assert.match(themesCss, /--cf-glass-alpha:\s*\.18/);
  assert.match(themesCss, /background-image:[\s\S]{0,600}var\(--cf-theme-background-texture\)/);
  assert.doesNotMatch(themesCss, /repeating-linear-gradient|repeating-radial-gradient|conic-gradient/);
});

test('R6.6 includes server-authoritative five minute empty-room cleanup', () => {
  const migration = read('supabase/migrations/20260909120000_campfire_empty_room_cleanup.sql');
  assert.match(migration, /interval '5 minutes'/i);
  assert.match(migration, /after insert or update of left_at or delete on public\.campfire_members/i);
  assert.match(migration, /persistent\s*=\s*false/i);
  assert.match(migration, /delete from public\.campfires/i);
  assert.match(migration, /cron\.schedule/i);
  assert.match(home, /CampfireExpiryCountdown/);
});
