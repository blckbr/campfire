import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('src/CampfireHome.tsx', 'utf8');
const css = fs.readFileSync('src/CampfireR4Shell.css', 'utf8');
const voice = fs.readFileSync('src/CampfireVoiceDock.tsx', 'utf8');

test('side rails are user-resizable only between 75% and 100% of their predefined widths', () => {
  assert.match(home, /LEFT_RAIL_DEFAULT\s*=\s*252/);
  assert.match(home, /LEFT_RAIL_MIN\s*=\s*189/);
  assert.match(home, /RIGHT_RAIL_DEFAULT\s*=\s*308/);
  assert.match(home, /RIGHT_RAIL_MIN\s*=\s*231/);
  assert.match(home, /campfireLeftRailResizeHandle/);
  assert.match(home, /campfireRightRailResizeHandle/);
  assert.match(home, /beginRailResize\("left"/);
  assert.match(home, /beginRailResize\("right"/);
  assert.match(css, /\.blackPianoTheme \.main\s*\{[\s\S]*grid-template-columns:\s*var\(--cf-left-rail-width\)\s+minmax\(0,1fr\)\s*!important/);
  assert.match(css, /\.campfireRoomShell\s*>\s*\.campfireRightRail\s*\{[\s\S]*width:\s*var\(--cf-right-rail-width\)\s*!important/);
});

test('left rail gives its lower space to Campfires and create action moves to room topbar', () => {
  assert.doesNotMatch(home, /className="campfireLeftUserCard"/);
  assert.doesNotMatch(home, /className="startCampfire campfireCreatePrimary"/);
  assert.match(home, /className="campfireTopbarCreateButton"/);
  assert.match(css, /\.campfireLeftRailList\s*\{[\s\S]*flex:\s*1\s+1\s+auto\s*!important/);
});

test('Campfire header is one continuous bar containing identity and all compact actions', () => {
  const start = home.indexOf('<div className="campfireRoomHeader">');
  const end = home.indexOf('{showThemePicker', start);
  assert.ok(start >= 0 && end > start);
  const header = home.slice(start, end);
  assert.match(header, /campfireRoomIdentity/);
  assert.match(header, /campfireRoomHeaderControls/);
  assert.match(header, /campfireQuickActions/);
  assert.match(header, /<CampfireVoiceDock[\s\S]*variant="header"/);
  assert.equal((home.match(/<CampfireVoiceDock/g) || []).length, 1, 'no large bottom voice dock remains');
  assert.match(voice, /variant\s*===\s*"header"/);
  assert.match(css, /\.campfireRoomHeaderControls\s*\{[\s\S]*margin-left:\s*auto/);
});

test('participant cards are standardized and every circular surface is locked to 1:1', () => {
  assert.match(css, /--cf-participant-card-width:\s*176px/);
  assert.match(css, /--cf-participant-card-height:\s*164px/);
  assert.match(css, /\.campfireParticipantTile\s*\{[\s\S]*width:\s*var\(--cf-participant-card-width\)\s*!important[\s\S]*height:\s*var\(--cf-participant-card-height\)\s*!important/);
  assert.match(css, /\.campfireParticipantTileAvatar\.campfireStageAvatar\s*\{[\s\S]*width:\s*72px\s*!important[\s\S]*height:\s*72px\s*!important[\s\S]*aspect-ratio:\s*1\s*\/\s*1\s*!important/);
  assert.match(css, /\.campfireParticipantMore\s*>\s*span:first-child\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1\s*!important/);
});
