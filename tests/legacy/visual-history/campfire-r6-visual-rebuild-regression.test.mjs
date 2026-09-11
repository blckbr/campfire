import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('src/CampfireHome.tsx');
const voice = read('src/CampfireVoiceDock.tsx');
const themes = read('src/CampfireThemes.css');
const settingsCss = read('src/CampfireSettingsModal.css');
let r6 = '';
try { r6 = read('src/CampfireR6Shell.css'); } catch {}

test('R6 uses one continuous room header containing identity, room actions and header voice controls', () => {
  assert.match(home, /className="campfireRoomHeader"/);
  assert.match(home, /className="campfireRoomHeaderControls"/);
  assert.match(home, /<CampfireVoiceDock[\s\S]*?variant="header"/);
  assert.doesNotMatch(home, /\{\/\* ==================================================\s+VOICE \/ WEBCAM[\s\S]*?<CampfireVoiceDock/);
  assert.match(voice, /variant\?:\s*"dock"\s*\|\s*"header"/);
  assert.match(voice, /variant\s*===\s*"header"/);
});

test('R6.6 active room follows approved stretched stage geometry and equal participant cards', () => {
  assert.match(home, /className="campfireStage campfireStageMockup"/);
  assert.match(home, /campfireSpotlightCard campfireSpotlightPrimary/);
  assert.doesNotMatch(home, /className="campfireMoodCard campfireMoodMockup/);
  assert.match(home, /<CampfireRightRail[\s\S]{0,700}moodCoverUrl=/);
  assert.match(home, /className="[^"]*campfireParticipantGrid/);
  assert.match(r6, /\.campfireParticipantTile\s*\{[^}]*inline-size:\s*var\(--cf-participant-card-width\)/s);
  assert.match(r6, /\.campfireParticipantTileAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(r6, /flex-shrink:\s*0/);
});

test('R6 side rails resize only from 75 to 100 percent and create action lives in upper rail header', () => {
  assert.match(home, /const LEFT_RAIL_MIN_RATIO = 0\.75/);
  assert.match(home, /const RIGHT_RAIL_MIN_RATIO = 0\.75/);
  assert.match(home, /className="[^"]*campfireRailResizeHandle left"/);
  assert.match(home, /className="[^"]*campfireRailResizeHandle right"/);
  assert.match(home, /className="[^"]*campfireRailCreateTop/);
  assert.doesNotMatch(home, /className="campfireLeftUserCard"/);
  assert.doesNotMatch(home, /campfireCreatePrimary/);
  assert.match(r6, /--cf-left-rail-default:\s*252px/);
  assert.match(r6, /--cf-right-rail-default:\s*308px/);
});

test('R6 settings remains vertically reachable at high HUD scale', () => {
  assert.match(settingsCss, /\.campfireSettingsModal\s*\{[\s\S]*?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(settingsCss, /\.campfireSettingsBody\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/);
  assert.match(settingsCss, /\.campfireSettingsBody\s*>\s*main\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(settingsCss, /scrollbar-gutter:\s*stable/);
});

test('R6.6.3 Aero Liquid Glass is translucent enough to reveal the HD theme while reserving accent color for edge and glow', () => {
  assert.match(themes, /--cf-glass-neutral:/);
  assert.match(themes, /R6\.6\.3[\s\S]*?--cf-glass-alpha:\s*\.28/);
  assert.match(themes, /--cf-edge:/);
  assert.match(themes, /--cf-glow-soft:/);
  assert.match(themes, /R6\.6\.3[\s\S]*?backdrop-filter:blur\(18px\)\s+saturate\(1\.48\)/);
  assert.match(r6, /background:\s*var\(--cf-glass-surface\)/);
  assert.doesNotMatch(r6, /background:\s*var\(--cf-material-surface\)/);
});

test('R6 home exposes the approved cinematic dashboard regions', () => {
  for (const className of [
    'campfireHomeTopNavigation',
    'campfireHomeHeroMockup',
    'campfireHomeFeaturedGrid',
    'campfireHomeActivityGrid',
    'campfireHomeRightColumn',
  ]) {
    assert.match(home, new RegExp(`className="[^"]*${className}`));
  }
  assert.match(r6, /\.campfireHomeHeroMockup/);
  assert.match(r6, /\.campfireHomeFeaturedGrid/);
  assert.match(r6, /\.campfireHomeActivityGrid/);
});
