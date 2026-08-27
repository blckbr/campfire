import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Voice Pro processing helper keeps progressive gain and limiter contracts", () => {
  const source = read("src/media/voiceProcessing.ts");
  assert.match(source, /campfireVolumeToGain/);
  assert.match(source, /normalized\s*\*\s*normalized/);
  assert.match(source, /configureCampfireCompressor/);
  assert.match(source, /configureCampfireLimiter/);
  assert.match(source, /threshold\.value\s*=\s*-4/);
});

test("Voice Pro gate is a soft AudioWorklet and never hard-cuts to zero", () => {
  const source = read("public/audio/campfire-voice-gate.js");
  assert.match(source, /registerProcessor\s*\(\s*"campfire-voice-gate"/);
  assert.match(source, /floorGain/);
  assert.match(source, /thresholdDb/);
  assert.doesNotMatch(source, /currentGain\s*=\s*0\s*;/);
});

test("strong suppression is backed by pinned local RNNoise with clean fallback", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies["simple-rnnoise-wasm"], "1.1.0");

  const source = read("src/media/campfireRnnoise.ts");
  assert.match(source, /RNNoiseNode/);
  assert.match(source, /RNNoiseNode\.register\(context\)/);
  assert.match(source, /return null/);
  assert.match(source, /RNNoise indisponível/);
});

test("one owned microphone pipeline contains RNNoise gate compression meters gain and cleanup", () => {
  const source = read("src/media/campfireVoicePipeline.ts");
  assert.match(source, /createMediaStreamSource/);
  assert.match(source, /createCampfireRnnoiseNode/);
  assert.match(source, /campfire-voice-gate/);
  assert.match(source, /createDynamicsCompressor/);
  assert.match(source, /originalAnalyser/);
  assert.match(source, /processedAnalyser/);
  assert.match(source, /outgoingGain/);
  assert.match(source, /limiter/);
  assert.match(source, /createMediaStreamDestination/);
  assert.match(source, /setMuted/);
  assert.match(source, /dispose/);
});

test("microphone test can A/B monitor original and processed audio", () => {
  const source = read("src/media/campfireVoicePipeline.ts");
  assert.match(source, /originalMonitorGain/);
  assert.match(source, /source:\s*"original"\s*\|\s*"processed"/);
  assert.match(source, /source === "original"/);
});
