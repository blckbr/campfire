import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const voice = fs.readFileSync("src/useCampfireLiveKitVoice.ts", "utf8");
const processing = fs.readFileSync("src/media/voiceProcessing.ts", "utf8");

test("live Voice Pro exposes throttled original and processed microphone levels", () => {
  assert.match(voice, /inputLevel/);
  assert.match(voice, /processedLevel/);
  assert.match(voice, /originalAnalyser/);
  assert.match(voice, /processedAnalyser/);
  assert.match(voice, /requestAnimationFrame/);
  assert.match(voice, /METER_INTERVAL_MS\s*=\s*50/);
  assert.match(processing, /campfireAnalyserLevel/);
});

test("live Voice Pro stops its meter loop during cleanup", () => {
  assert.match(voice, /cancelAnimationFrame/);
  assert.match(voice, /meterFrameRef/);
});
