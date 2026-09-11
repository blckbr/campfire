import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const voice = fs.readFileSync(
  new URL("../src/useCampfireLiveKitVoice.ts", import.meta.url),
  "utf8"
);
const settings = fs.readFileSync(
  new URL("../src/CampfireSettingsModal.tsx", import.meta.url),
  "utf8"
);

test("changing the selected microphone replaces the published LiveKit track", () => {
  assert.match(voice, /replaceTrack\(/);
  assert.match(voice, /refreshPublishedMicrophone/);
  assert.match(voice, /CAMPFIRE_MEDIA_SETTINGS_EVENT/);
});

test("200 percent uses stronger progressive amplification and a limiter", () => {
  const pipeline = fs.readFileSync(new URL("../src/media/campfireVoicePipeline.ts", import.meta.url), "utf8");
  const processing = fs.readFileSync(new URL("../src/media/voiceProcessing.ts", import.meta.url), "utf8");
  assert.match(processing, /normalized\s*\*\s*normalized/);
  assert.match(processing, /configureCampfireLimiter/);
  assert.match(pipeline, /createDynamicsCompressor/);
  assert.match(pipeline, /outgoingGain\.connect\(limiter\)/);
  assert.match(pipeline, /monitorGain\.connect\(monitorLimiter\)/);
});

test("settings tell the user that microphone changes apply automatically", () => {
  assert.doesNotMatch(settings, /saia e entre novamente na voz/i);
  assert.match(settings, /aplicad[ao] automaticamente/i);
});
