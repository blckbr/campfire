import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/useCampfireLiveKitVoice.ts", "utf8");

test("Voice Pro owns one microphone pipeline and hot-replaces the published track", () => {
  assert.match(source, /microphonePipelineRef/);
  assert.match(source, /createCampfireVoicePipeline/);
  assert.match(source, /replaceTrack\(/);
  assert.match(source, /CAMPFIRE_MEDIA_SETTINGS_EVENT/);
});

test("mute controls pipeline track gain and LiveKit publication", () => {
  assert.match(source, /microphonePipelineRef\.current\?\.setMuted\(effectiveMuted\)/);
  assert.match(source, /if \(effectiveMuted\) await publication\.mute\(\)/);
  assert.match(source, /else await publication\.unmute\(\)/);
});

test("deafen remembers prior mute state and controls the playback context", () => {
  assert.match(source, /preDeafenMutedRef/);
  assert.match(source, /await applyMute\(true\)/);
  assert.match(source, /remoteAudioMixerRef\.current\?\.setDeafened\(next\)/);
  assert.match(source, /await applyMute\(preDeafenMutedRef\.current\)/);
});

test("Voice Pro profile changes refresh the live microphone", () => {
  assert.match(source, /voiceProfile/);
  assert.match(source, /setVoiceProfile/);
  assert.match(source, /previous\.voiceProfile\s*!==\s*next\.voiceProfile/);
  assert.match(source, /previous\.gateMode\s*!==\s*next\.gateMode/);
});
