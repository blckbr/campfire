import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("LiveKit mute diagnostics observe and enforce one microphone publication", () => {
  assert.equal(fs.existsSync("src/campfireVoiceDiagnostics.ts"), true);
  const diagnostics = read("src/campfireVoiceDiagnostics.ts");
  const voice = read("src/useCampfireLiveKitVoice.ts");
  assert.match(diagnostics, /snapshotCampfireVoicePublications/);
  assert.match(diagnostics, /enforceSingleMicrophonePublication/);
  assert.match(diagnostics, /Track\.Source\.Microphone/);
  assert.match(voice, /enforceSingleMicrophonePublication/);
  assert.match(voice, /snapshotCampfireVoicePublications/);
  assert.match(voice, /applyEffectiveMicrophoneGate/);
  assert.match(voice, /publication\.mute\(\)/);
  assert.match(voice, /publication\.unmute\(\)/);
});

test("mute verification runs after publish and toggle rather than being visual only", () => {
  const voice = read("src/useCampfireLiveKitVoice.ts");
  assert.match(voice, /verifyMicrophoneInvariant/);
  assert.match(voice, /publishMicrophone[\s\S]*verifyMicrophoneInvariant/);
  assert.match(voice, /toggleMute[\s\S]*verifyMicrophoneInvariant/);
});
