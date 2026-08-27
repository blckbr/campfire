import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const home = fs.readFileSync(new URL('../src/CampfireHome.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');

test('WLM menu bar is interactive instead of static labels', () => {
  assert.doesNotMatch(home, /<span>Arquivo<\/span>/);
  assert.match(home, /activeAppMenu/);
  assert.match(home, /className="blackPianoMenuButton"/);
  assert.match(home, /className="blackPianoMenuDropdown"/);
  for (const label of ['Nova Campfire','Adicionar amigo','Sair da Campfire selecionada','Configurações','Sobre o Campfire']) {
    assert.match(home, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /\.blackPianoMenuDropdown/);
});
