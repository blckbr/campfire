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
  assert.match(source, /pipeline\?\.setMuted\(next\)/);
  assert.match(source, /await publication\.mute\(\)/);
  assert.match(source, /await publication\.unmute\(\)/);
});

test("deafen remembers prior mute state and controls the playback context", () => {
  assert.match(source, /muteBeforeDeafenRef/);
  assert.match(source, /await applyMute\(true\)/);
  assert.match(source, /context\.suspend\(\)/);
  assert.match(source, /context\.resume\(\)/);
  assert.match(source, /await applyMute\(false\)/);
});

test("Voice Pro profile changes refresh the live microphone", () => {
  assert.match(source, /voiceProfile/);
  assert.match(source, /setVoiceProfile/);
  assert.match(source, /previous\.voiceProfile\s*!==\s*next\.voiceProfile/);
  assert.match(source, /previous\.gateMode\s*!==\s*next\.gateMode/);
});
