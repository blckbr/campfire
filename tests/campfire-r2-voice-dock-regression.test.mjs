import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("voice dock keeps primary call controls compact and hides advanced mixer behind settings", () => {
  const dock = read("src/CampfireVoiceDock.tsx");
  assert.match(dock, /showAdvanced/);
  assert.match(dock, /Configurações/);
  assert.match(dock, /showAdvanced\s*&&[\s\S]*campfireVoiceMixer/);
  assert.match(dock, /Microfone/);
  assert.match(dock, /Deafen/);
});
