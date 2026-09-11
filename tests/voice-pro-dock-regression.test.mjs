import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dock = fs.readFileSync("src/CampfireVoiceDock.tsx", "utf8");
const css = fs.readFileSync("src/CampfireVoiceDock.css", "utf8");

test("Voice Dock exposes explicit accessible states instead of icon-only controls", () => {
  assert.match(dock, /aria-pressed=\{voice\.muted\}/);
  assert.match(dock, /aria-pressed=\{voice\.deafened\}/);
  assert.match(dock, /aria-pressed=\{voice\.cameraEnabled\}/);
  assert.match(dock, /Microfone mutado/);
  assert.match(dock, /Áudio desativado/);
  assert.match(dock, /Câmera ligada/);
});

test("Voice Dock shows the active Voice Pro profile and real microphone meter", () => {
  assert.match(dock, /Supressão forte • RNNoise ativo/);
  assert.match(dock, /Voz limpa • RNNoise indisponível/);
  assert.match(dock, /Voz limpa • Supressão nativa/);
  assert.match(dock, /Studio \/ Hi-Fi/);
  assert.match(dock, /role="meter"/);
  assert.match(dock, /aria-valuenow=\{voice\.inputLevel\}/);
  assert.match(dock, /campfireVoiceMeter/);
});

test("Voice Dock keeps functional typography at thirteen pixels or larger", () => {
  for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) {
    const size = Number(match[1]);
    assert.ok(size >= 13, `functional font-size below 13px: ${size}px`);
  }
});
