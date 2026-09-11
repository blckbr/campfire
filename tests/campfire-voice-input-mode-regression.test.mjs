import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('voice input mode persists voice activity or optional push-to-talk with no implicit binding', () => {
  const path = 'src/campfireVoiceInputMode.ts';
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /campfire\.voice\.input\.v1/);
  assert.match(source, /voice-activity/);
  assert.match(source, /push-to-talk/);
  assert.match(source, /binding:\s*null/);
  assert.match(source, /CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT/);
  assert.match(source, /isCampfireVoiceTypingTarget/);
  assert.match(source, /matchesCampfirePushToTalkBinding/);
});
