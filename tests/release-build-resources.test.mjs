import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("Windows release has the configured ICO build resource", () => {
  assert.equal(pkg.build.win.icon, "build/icon.ico");
  assert.ok(fs.existsSync("build/icon.ico"), "build/icon.ico must exist for the Windows NSIS/portable build");
  assert.ok(fs.statSync("build/icon.ico").size > 1024, "build/icon.ico must be a real multi-size icon");
});
