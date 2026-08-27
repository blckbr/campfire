import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

test('renderer translation layer follows system/manual language without translating user input fields', () => {
  for (const locale of ['pt-BR','en-US','es-ES','fr-FR','de-DE','it-IT']) assert.match(preload, new RegExp(locale.replace('-', '\\-')));
  assert.match(preload, /MutationObserver/);
  assert.match(preload, /applyCampfireTranslations/);
  assert.match(preload, /textarea|input/);
  assert.match(preload, /campfire:preferences-changed/);
});
