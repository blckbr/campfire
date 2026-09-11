import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const sha256 = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");

const expectedFireHashes = new Map([
  ["website/assets/fire/campfire-base-hyperreal.webp", "b1b6b56bbc129714aff010474851128d92bff07692e0b49a1835ea9a02766af7"],
  ["website/assets/fire/campfire-flames-real.webp", "6afc6bae0751602891a31c2cb347bc930e1e14844eecd1b4c68b67e5e4f597e2"],
  ["website/assets/fire/campfire-logs-real.webp", "0289f879ca91c2ca0137a00b988ef2aa9276b672111a28518877ba033e70d061"],
  ["website/assets/fire/real-fire-alpha.webm", "29c7f0036f9ba6b924cd18b3ea2170491fddf20db11a38b50a500bd429d59312"],
]);

const currentScreenshotHashes = new Map([
  ["website/assets/screenshots/current-call-r66615.png", "79b568419175a7e75bb662a990737691c0ac2bf277a4bb4355c3adead2c7d0ee"],
  ["website/assets/screenshots/current-home-r66615.png", "9517e985f62bc513531c3a915d0762255801fba28c5a80be5e84a23188b84ea7"],
  ["website/assets/screenshots/current-countdown-r66615.png", "e1ce5d03ffb2cade586a7858e4e57d4a776258f75484e580c2588d2a0e01c74d"],
]);

test("public site preserves the approved hyper-real Campfire fire media byte-for-byte", () => {
  for (const [path, expected] of expectedFireHashes) {
    assert.equal(fs.existsSync(path), true, `missing fire asset: ${path}`);
    assert.equal(sha256(path), expected, `fire asset changed: ${path}`);
  }
  const html = read("website/index.html");
  assert.match(html, /assets\/fire\/campfire-base-hyperreal\.webp/);
  assert.match(html, /assets\/fire\/real-fire-alpha\.webm/);
});


test("public site showcases the exact approved R6.6.6.15 visual-reference captures", () => {
  const html = read("website/index.html");
  for (const [path, expected] of currentScreenshotHashes) {
    assert.equal(fs.existsSync(path), true, `missing current reference screenshot: ${path}`);
    assert.equal(sha256(path), expected, `current reference screenshot changed: ${path}`);
    assert.match(html, new RegExp(path.split("/").at(-1).replaceAll(".", "\\.")));
  }
});

test("public site identifies itself as Campfire 1.1.0 and exposes every approved native package", () => {
  const config = read("website/config.js");
  const html = read("website/index.html");

  assert.match(config, /version:\s*["']1\.1\.0["']/);
  assert.match(config, /CAMPFIRE_DOWNLOADS/);
  for (const key of ["windowsSetup", "windowsPortable", "linuxRpm", "linuxAppImage"]) {
    assert.match(config, new RegExp(`${key}\\s*:`), `missing ${key}`);
    assert.match(html, new RegExp(`data-download-kind=["']${key}["']`), `missing visible ${key} choice`);
  }
  assert.match(html, /Windows Setup/i);
  assert.match(html, /Windows Portable/i);
  assert.match(html, /Linux RPM/i);
  assert.match(html, /Linux AppImage/i);
});

test("public site carries the current Simple Dark visual language without reintroducing theme selection", () => {
  const html = read("website/index.html");
  const css = read("website/styles.css");

  assert.match(css, /--cf-site-bg\s*:\s*#060a0f/i);
  assert.match(css, /--cf-site-panel\s*:/i);
  assert.match(css, /backdrop-filter\s*:\s*blur/i);
  assert.match(css, /#070c12|#05090e/i);
  assert.match(html, /CAMPFIRE BLACK PIANO · 1\.1\.0/i);
  assert.doesNotMatch(html, /Marshmallow Colorido|Escolher tema|Temas disponíveis/i);
  assert.doesNotMatch(css, /data-campfire-theme\s*=|marshmallow-colorido/i);
});

test("platform recommendation highlights one download while all four choices remain in the DOM", () => {
  const js = read("website/app.js");
  assert.match(js, /windowsSetup/);
  assert.match(js, /linuxRpm|linuxAppImage/);
  assert.match(js, /data-download-kind/);
  assert.match(js, /recommended|recomend/i);
  assert.doesNotMatch(js, /style\.display\s*=\s*["']none["']/);
  assert.doesNotMatch(js, /\.remove\(\).*data-download-kind|removeChild\(.*download/i);
});
