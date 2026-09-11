import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const settings = fs.readFileSync('src/CampfireSettingsModal.tsx', 'utf8');

test('Escape closes Settings when no shortcut capture owns the key', () => {
  assert.match(settings, /if \(!open \|\| recordingPushToTalk\) return;/);
  assert.match(settings, /event\.key !== ["']Escape["']/);
  assert.match(settings, /onClose\(\)/);
  assert.match(settings, /window\.addEventListener\(["']keydown["'],\s*closeSettingsFromEscape,\s*true\)/);
  assert.match(settings, /window\.removeEventListener\(["']keydown["'],\s*closeSettingsFromEscape,\s*true\)/);
});
