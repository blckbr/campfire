import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("src/CampfireSettingsModal.tsx", "utf8");
const hook = fs.readFileSync("src/useCampfireMicrophoneTest.ts", "utf8");

test("settings expose the three Voice Pro profiles and native processing controls", () => {
  assert.match(settings, /Voz limpa/);
  assert.match(settings, /Supressão forte/);
  assert.match(settings, /Studio \/ Hi-Fi/);
  assert.match(settings, /Cancelamento de eco/);
  assert.match(settings, /Supressão nativa de ruído/);
  assert.match(settings, /Ganho automático/);
  assert.match(settings, /Sensibilidade/);
});

test("microphone test uses the production Voice Pro pipeline without LiveKit publication", () => {
  assert.match(hook, /createCampfireVoicePipeline/);
  assert.match(hook, /originalAnalyser/);
  assert.match(hook, /processedAnalyser/);
  assert.match(hook, /requestAnimationFrame/);
  assert.doesNotMatch(hook, /requestCampfireMediaToken/);
  assert.doesNotMatch(hook, /publishTrack/);
});

test("settings can compare original and processed microphone monitoring", () => {
  assert.match(settings, /Entrada original/);
  assert.match(settings, /Voz processada/);
  assert.match(settings, /Ouvir meu microfone/);
  assert.match(settings, /Original/);
  assert.match(settings, /Processado/);
});

test("custom settings select narrows webcam quality without DOM event casts", () => {
  assert.match(settings, /type CampfireVideoQuality/);
  assert.match(
    settings,
    /onChange=\{\(value\)\s*=>\s*updateSetting\(\s*"videoQuality",\s*value\s+as\s+CampfireVideoQuality\s*\)\s*\}/s
  );
  assert.match(
    settings,
    /onChange=\{\(value\)\s*=>\s*updateSetting\(\s*"audioInputId",\s*value\s*\)\s*\}/s
  );
  assert.doesNotMatch(
    settings,
    /updateSetting\(\s*"audioInputId",\s*value\s+as\s+CampfireVideoQuality/s
  );
});
