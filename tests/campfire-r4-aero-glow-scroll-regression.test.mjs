import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('R4 theme system exposes Aero/material tokens and applies them to the full app chrome', () => {
  const themes = read('src/CampfireThemes.css');
  const r4 = read('src/CampfireR4Shell.css');

  for (const token of ['--cf-edge:', '--cf-edge-bright:', '--cf-glow-soft:', '--cf-glass-tint:', '--cf-material-surface:']) {
    assert.match(themes, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const selector of [
    '.blackPianoMenuBar',
    '.topbar',
    '.campfireLeftRail',
    '.campfireRightRail',
    '.campfireSpotlightCard',
    '.campfireMoodCard',
    '.campfireVoiceDock',
    '.campfireWorkspacePanel',
    '.campfireSettingsModal',
  ]) {
    assert.match(r4, new RegExp(selector.replace('.', '\\.') + '[^{]*\\{[^}]*--cf-edge|'+selector.replace('.', '\\.')+'[^{]*\\{[^}]*var\\(--cf-edge', 's'));
  }

  assert.match(r4, /box-shadow:[^;}]*var\(--cf-glow-soft/s);
  assert.match(r4, /background:[^;}]*var\(--cf-material-surface/s);
});

test('R4 settings stay scrollable at high HUD scale instead of clipping controls', () => {
  const css = read('src/CampfireR4Shell.css');
  assert.match(css, /\.campfireSettingsModal\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.campfireSettingsBody\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.campfireSettingsBody\s*>\s*main\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(css, /\.campfireSettingsBody\s*>\s*aside\s*\{[^}]*overflow-y:\s*auto/s);
});

test('R4 theme scrollbar and all circular avatars remain theme-aware and geometrically stable', () => {
  const css = read('src/CampfireR4Shell.css');
  assert.match(css, /scrollbar-color:\s*var\(--cf-edge-bright\)/);
  assert.match(css, /\.campfireRailAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1[^}]*flex-shrink:\s*0/s);
  assert.match(css, /\.campfireSpotlightAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1[^}]*flex-shrink:\s*0/s);
  assert.match(css, /\.campfireParticipantTileAvatar[^}]*aspect-ratio:\s*1\s*\/\s*1[^}]*flex-shrink:\s*0/s);
});
