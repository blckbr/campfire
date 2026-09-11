import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'src');
const home = fs.readFileSync(path.join(src, 'CampfireHome.tsx'), 'utf8');
const settingsCss = fs.readFileSync(path.join(src, 'CampfireSettingsModal.css'), 'utf8');
const shellCss = fs.readFileSync(path.join(src, 'CampfireR6Shell.css'), 'utf8');

test('R6.6.6.7 renders active camera video inside the Campfire stage', () => {
  assert.match(home, /function CampfireStageVideo[\s\S]*?video\.srcObject = stream/);
  assert.match(home, /voice\.localCameraStream/);
  assert.match(home, /voice\.remoteStreams/);
  assert.match(home, /className="campfireSpotlightCamera"/);
  assert.match(home, /className="campfireParticipantCamera"/);
  assert.match(shellCss, /\.campfireSpotlightCamera[\s\S]*?object-fit:\s*cover/);
  assert.match(shellCss, /\.campfireParticipantCamera[\s\S]*?object-fit:\s*cover/);
});

test('R6.6.6.7 header control feedback is transient and never blocks the controls', () => {
  assert.match(shellCss, /@keyframes campfireVoiceTransientMessage/);
  assert.match(shellCss, /\.campfireVoiceDock\.headerCompact \.campfireVoiceMessage[\s\S]*?animation:\s*campfireVoiceTransientMessage/);
  assert.match(shellCss, /\.campfireVoiceDock\.headerCompact \.campfireVoiceMessage[\s\S]*?pointer-events:\s*none/);
  assert.match(shellCss, /\.campfireVoiceDock\.headerCompact \.campfireVoiceMixer[\s\S]*?display:\s*none/);
  assert.match(shellCss, /\.campfireVoiceDock\.headerCompact \.campfireVoiceVideoGrid[\s\S]*?display:\s*none/);
});

test('R6.6.6.7 webcam test preview is a useful 16:9 size', () => {
  assert.match(settingsCss, /\.campfireDevicePreview[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(settingsCss, /\.campfireDevicePreview[\s\S]*?min-height:\s*280px/);
  assert.match(settingsCss, /\.campfireDevicePreview video[\s\S]*?min-height:\s*280px/);
});
