import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const settings = fs.readFileSync(new URL('../src/CampfireSettingsModal.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/CampfireSettingsModal.css', import.meta.url), 'utf8');
const appCss = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');

test('settings expose language, independent scale and close policy', () => {
  for (const token of ['Aparência e idioma','Usar idioma do Windows','80','150','Perguntar sempre','Minimizar para a bandeja','Português (Brasil)','English','Español','Français','Deutsch','Italiano']) {
    assert.match(settings, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(settings, /updateDesktopPreferences/);
  assert.match(css, /width:\s*min\(920px/);
  assert.match(appCss, /font-size:\s*14px/);
});
