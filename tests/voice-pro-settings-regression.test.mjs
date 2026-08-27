import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/campfireMediaSettings.ts", "utf8");

test("Voice Pro settings expose clean strong and studio profiles", () => {
  assert.match(source, /"clean"\s*\|\s*"strong"\s*\|\s*"studio"/);
  assert.match(source, /voiceProfile:/);
  assert.match(source, /echoCancellation:/);
  assert.match(source, /nativeNoiseSuppression:/);
  assert.match(source, /autoGainControl:/);
  assert.match(source, /gateMode:/);
  assert.match(source, /gateSensitivity:/);
});

test("legacy audioProfile migrates to the Voice Pro profile", () => {
  assert.match(source, /parsed\.audioProfile\s*===\s*"studio"/);
  assert.match(source, /parsed\.audioProfile\s*===\s*"voice"/);
  assert.match(source, /"clean"/);
});

test("audioInputConstraint consumes Voice Pro processing settings", () => {
  assert.match(source, /settings:\s*Pick</);
  assert.match(source, /settings\.voiceProfile\s*===\s*"studio"/);
  assert.match(source, /settings\.echoCancellation/);
  assert.match(source, /settings\.nativeNoiseSuppression/);
  assert.match(source, /settings\.autoGainControl/);
});
