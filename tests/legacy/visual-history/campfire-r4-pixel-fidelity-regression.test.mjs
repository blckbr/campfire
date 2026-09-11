import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('R4 home exposes the same major regions as the approved cinematic mockup', () => {
  const home = read('src/CampfireHome.tsx');
  for (const token of [
    'campfireHomeNav',
    'campfireHomeHighlights',
    'campfireHomeDashboardGrid',
    'campfireHomeActivityPanel',
    'campfireHomeEventsPanel',
    'campfireHomeFriendsPanel',
    'campfireHomeSuggestionsPanel',
    'campfireHomeQuotePanel',
  ]) assert.match(home, new RegExp(token));
});

test('R4 never hides core rails or functions when HUD grows; the shell scrolls instead', () => {
  const css = read('src/CampfireR4Shell.css');
  assert.match(css, /--cf-r4-min-width:\s*1280px/);
  assert.match(css, /\.blackPianoTheme \.main\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.campfireLeftRailList[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.campfireRightRail[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.campfireRoomShell\s*>\s*\.campfireRightRail[^}]*display:\s*block\s*!important/s);
  assert.doesNotMatch(css, /\.campfireRoomShell\s*>\s*\.campfireRightRail[^}]*display:\s*none/s);
});

test('R4 circular avatars cannot be squeezed into ovals by flex layout', () => {
  const css = read('src/CampfireR4Shell.css');
  assert.match(css, /\.campfireParticipantTileAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(css, /\.campfireParticipantTileAvatar\.campfireStageAvatar[^}]*flex:\s*0\s+0\s+72px\s*!important/s);
  assert.match(css, /\.campfireRailAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(css, /\.campfireSpotlightAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
});

test('R4 internal Campfire keeps mockup-B composition and compact upper-right actions', () => {
  const css = read('src/CampfireR4Shell.css');
  assert.match(css, /\.campfireStage\s*\{[^}]*grid-template-columns:\s*minmax\(0,1\.72fr\)\s+minmax\(250px,\.82fr\)/s);
  assert.match(css, /\.campfireQuickActions\s*\{[^}]*top:\s*16px[^}]*right:\s*calc\(var\(--cf-right-rail-width\) \+ 18px\)/s);
  assert.match(css, /\.campfireWorkspaceOverlay[^}]*overflow:\s*auto/s);
});
