import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.env.CAMPFIRE_TEST_ROOT || process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('src/CampfireSettingsModal.tsx');
const micHook = read('src/useCampfireMicrophoneTest.ts');

test('microphone permission is primed even when enumerateDevices initially exposes only outputs', () => {
  const startIndex = settings.indexOf('await microphoneTest.start();');
  const refreshAfterStartIndex = settings.indexOf('const refreshedDevices = await refreshDevices();');
  assert.ok(startIndex >= 0, 'microphone test must start explicitly');
  assert.ok(refreshAfterStartIndex > startIndex, 'devices must be re-enumerated only after microphone permission/capture starts');
  assert.doesNotMatch(settings, /hasKnownMicrophone\s*=\s*devices\.some/);
  assert.doesNotMatch(settings, /hasKnownMicrophone\s*\|\|\s*devices\.length\s*===\s*0/);
});

test('microphone list refreshes after permission and on Windows device hot-plug changes', () => {
  assert.match(settings, /refreshedDevices\.filter\([\s\S]*device\.kind\s*===\s*["']audioinput["']/);
  assert.match(settings, /addEventListener\(\s*["']devicechange["']/);
  assert.match(settings, /removeEventListener\(\s*["']devicechange["']/);
});

test('stale saved microphone id falls back to the current Windows default input', () => {
  assert.match(micHook, /isUnavailableSelectedMicrophone/);
  assert.match(micHook, /NotFoundError/);
  assert.match(micHook, /OverconstrainedError/);
  assert.match(micHook, /audioInputId:\s*["']["']/);
  assert.match(micHook, /createCampfireVoicePipeline\([\s\S]*audioInputId:\s*["']["']/);
});

test('camera failure no longer tears down a working microphone test', () => {
  assert.match(settings, /Webcam indisponível durante o teste; mantendo o microfone ativo/);
});
