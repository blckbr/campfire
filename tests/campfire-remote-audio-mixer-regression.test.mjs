import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('remote mixer has gain limiter dedupe output routing and 0-200 percent controls', () => {
  const path = 'src/campfireRemoteAudioMixer.ts';
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /createGain\(/);
  assert.match(source, /createDynamicsCompressor\(/);
  assert.match(source, /Math\.min\(200/);
  assert.match(source, /trackSid/);
  assert.match(source, /setOutputDevice/);
  assert.match(source, /setLocallyMuted/);
  assert.match(source, /setDeafened/);
  assert.match(source, /dispose/);
});
