import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const script = fs.readFileSync("CAMPFIREWEB_PUBLICAR.bat", "utf8");

test("CampfireWeb publisher identifies the 1.1.0 checkpoint", () => {
  assert.match(script, /CAMPFIREWEB 1\.1\.0 - PUBLICAR CLOUDFLARE PAGES/);
  assert.match(script, /CAMPFIREWEB 1\.1\.0 - VALIDAR E PUBLICAR/);
});
