import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/CampfireVoiceDock.css", "utf8");

test("Voice Dock native profile options stay readable when Windows opens the select", () => {
  assert.match(
    css,
    /\.blackPianoTheme\s+\.campfireVoiceAudioProfile\s+select\s+option\s*\{[\s\S]*?background:\s*#e5e7eb\s*;[\s\S]*?color:\s*#111827\s*;/i
  );
});
