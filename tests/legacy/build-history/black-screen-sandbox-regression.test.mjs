import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(
  new URL("../_campfire_black_screen_fix/electron/main.mjs", import.meta.url),
  "utf8"
);

function mainWindowBlock(text) {
  const start = text.indexOf("mainWindow = new BrowserWindow({");
  assert.notEqual(start, -1, "main BrowserWindow ausente");
  const end = text.indexOf("});", start);
  assert.notEqual(end, -1, "fim do main BrowserWindow ausente");
  return text.slice(start, end + 3);
}

test("trusted Campfire shell avoids Electron sandbox bootstrap race", () => {
  const block = mainWindowBlock(main);
  assert.match(block, /nodeIntegration:\s*false/);
  assert.match(block, /contextIsolation:\s*true/);
  assert.match(
    block,
    /sandbox:\s*false/,
    "janela principal deve evitar sandboxed_renderer startupData race"
  );
});

test("untrusted/external surfaces remain sandboxed", () => {
  assert.match(
    main,
    /screen-picker-preload\.cjs[\s\S]{0,240}sandbox:\s*true/,
    "seletor de tela deve continuar sandboxado"
  );
  assert.match(
    main,
    /partition:\s*ANIME_PARTITION[\s\S]{0,220}sandbox:\s*true/,
    "webview de Anime deve continuar sandboxada"
  );
});
