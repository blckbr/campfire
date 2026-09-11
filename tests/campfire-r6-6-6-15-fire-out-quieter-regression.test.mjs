import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const desktop = fs.readFileSync('src/desktop.ts', 'utf8');

test('fire extinguish effect is reduced to ten percent playback volume', () => {
  assert.match(desktop, /const FIRE_OUT_EFFECT_VOLUME = 0\.10;/);
  assert.match(desktop, /audio\.volume = FIRE_OUT_EFFECT_VOLUME;/);
});

test('quieter fire extinguish effect remains gated by app sounds', () => {
  const start = desktop.indexOf('function playCampfireFireOutSound');
  const end = desktop.indexOf('function installCampfireAppSoundBridge', start);
  assert.ok(start >= 0 && end > start, 'fire-out playback block missing');
  const block = desktop.slice(start, end);
  assert.match(block, /if \(!preferences\.notificationSound\) return;/);
});
