import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const expectedNames = [
  "Black Piano Glow",
  "Silver Glow",
  "Esmeralda Glow",
  "Vermelho Sangue Glow",
  "Topázio Glow",
  "Branco Marshmallow Glow",
  "Marshmallow Levemente Tostado Glow",
  "Marshmallow Colorido Glow",
  "Safira Elétrica",
  "Ametista Neon",
  "Ônix Glow",
  "Rubi Real",
  "Âmbar Dourado",
  "Jade Frost",
  "Pérola Lunar",
  "Cobre Lux",
  "Obsidiana Azul",
  "Rosé Cristal",
  "Gelo Polar",
  "Lavanda Dream",
  "Caramelo Glow",
  "Marshmallow Rosa",
  "Marshmallow Noturno",
];

test("Campfire exposes exactly the 23 approved individual themes", () => {
  assert.equal(fs.existsSync("src/campfireThemes.ts"), true);
  const themes = read("src/campfireThemes.ts");
  for (const name of expectedNames) assert.match(themes, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(themes, /CAMPFIRE_THEMES/);
  assert.match(themes, /loadGlobalCampfireTheme/);
  assert.match(themes, /saveGlobalCampfireTheme/);
  assert.match(themes, /loadCampfireThemeOverride/);
  assert.match(themes, /saveCampfireThemeOverride/);
  assert.match(themes, /userId/);
  assert.match(themes, /campfireId/);
});

test("theme CSS is token based and activated by data-campfire-theme", () => {
  assert.equal(fs.existsSync("src/CampfireThemes.css"), true);
  const css = read("src/CampfireThemes.css");
  assert.match(css, /data-campfire-theme/);
  assert.match(css, /--cf-accent/);
  assert.match(css, /--cf-glow/);
  assert.match(css, /--cf-panel/);
  assert.doesNotMatch(css, /filter:\s*hue-rotate/i);
});
