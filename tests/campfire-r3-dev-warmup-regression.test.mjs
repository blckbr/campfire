import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dev = fs.readFileSync('scripts/dev.mjs','utf8');

test('dev launcher warms critical Campfire modules before spawning Electron', () => {
  assert.match(dev, /async function warmup/);
  assert.match(dev, /CampfireHome\.tsx/);
  assert.match(dev, /CampfireScreenShare\.tsx/);
  assert.match(dev, /CampfireCoverPicker\.tsx/);
  assert.match(dev, /await warmup\(url,vite\)/);
  const warmupIndex = dev.indexOf('await warmup(url,vite)');
  const electronIndex = dev.indexOf('electron=spawn');
  assert.ok(warmupIndex >= 0 && electronIndex > warmupIndex, 'Electron must spawn after module warmup');
});
