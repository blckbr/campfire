import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("src/CampfireSettingsModal.tsx", "utf8");

function testDevicesBlock() {
  const start = settings.indexOf("async function testDevices()");
  const end = settings.indexOf("function updateSetting<", start);
  assert.notEqual(start, -1, "testDevices() missing");
  assert.notEqual(end, -1, "testDevices() end missing");
  return settings.slice(start, end);
}

test("Permitir e testar auto-enables audible local return in live mode", () => {
  const block = testDevicesBlock();
  assert.match(block, /const shouldMonitorLive = microphoneTestMode === ["']live["']/);
  assert.match(block, /microphoneTest\.setMonitorSource\(["']processed["']\)/);
  assert.match(block, /microphoneTest\.setListening\(shouldMonitorLive\)/);
  const listen = block.indexOf("microphoneTest.setListening(shouldMonitorLive)");
  const start = block.indexOf("await microphoneTest.start()");
  assert.ok(listen >= 0 && start >= 0 && listen < start, "listening must be enabled before the pipeline starts");
});

test("record mode does not force self-monitoring", () => {
  const block = testDevicesBlock();
  assert.match(block, /shouldMonitorLive \? ["']Retorno local ativo["'] : ["']Captura ativa["']/);
  assert.match(block, /microphoneTest\.setListening\(shouldMonitorLive\)/);
});
