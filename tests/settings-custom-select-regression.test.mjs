import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("src/CampfireSettingsModal.tsx", "utf8");
const select = fs.existsSync("src/CampfireSelect.tsx")
  ? fs.readFileSync("src/CampfireSelect.tsx", "utf8")
  : "";
const css = fs.existsSync("src/CampfireSelect.css")
  ? fs.readFileSync("src/CampfireSelect.css", "utf8")
  : "";

test("settings replace native selects with the Campfire Black Piano select", () => {
  assert.match(settings, /import CampfireSelect from "\.\/CampfireSelect"/);
  assert.doesNotMatch(settings, /<select\b/i);
  assert.doesNotMatch(settings, /<option\b/i);
  assert.ok((settings.match(/<CampfireSelect\b/g) ?? []).length >= 8);
});

test("CampfireSelect exposes accessible combobox and listbox semantics", () => {
  assert.match(select, /role="combobox"/);
  assert.match(select, /aria-expanded=/);
  assert.match(select, /aria-haspopup="listbox"/);
  assert.match(select, /role="listbox"/);
  assert.match(select, /role="option"/);
  assert.match(select, /aria-selected=/);
});

test("CampfireSelect supports keyboard navigation and dismissal", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]) {
    assert.match(select, new RegExp(`event\\.key === ["']${key}["']`));
  }
  assert.match(select, /pointerdown/);
  assert.match(select, /createPortal/);
});

test("Black Piano popup gives every option a dark readable surface", () => {
  assert.match(css, /\.campfireSelectMenu\.isBlackPiano/);
  assert.match(css, /\.campfireSelectMenu\.isBlackPiano\s+\.campfireSelectOption/);
  assert.match(css, /color:\s*#(?:f[0-9a-f]{5}|e[0-9a-f]{5})/i);
  assert.match(css, /background:\s*#(?:0[0-9a-f]{5}|1[0-9a-f]{5}|2[0-9a-f]{5})/i);
  assert.match(css, /\.campfireSelectOption\[aria-selected="true"\]/);
});
