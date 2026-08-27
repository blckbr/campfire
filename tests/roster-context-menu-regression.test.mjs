import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const home = read('src/CampfireHome.tsx');
const rooms = read('src/useCampfires.ts');
const css = read('src/App.css');
const menu = read('src/UserContextMenu.tsx');
const membersPanel = read('src/CampfireMembersPanel.tsx');
const actions = read('src/useCampfireUserActions.ts');
const preload = read('electron/preload.cjs');
const main = read('electron/main.mjs');
const desktop = read('src/desktop.ts');

test('Campfire cards expose a vertical scrollable username roster instead of a people count', () => {
  assert.match(rooms, /members:\s*CampfireRosterMember\[\]/);
  assert.match(rooms, /get_campfire_members/);
  assert.match(home, /campfireRoster/);
  assert.match(home, /room\.members\.map/);
  assert.doesNotMatch(home, /`\$\{room\.activePeople\} pessoa\(s\)`/);
  assert.match(css, /\.campfireRoster\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.campfireRoster\s*\{[^}]*max-height:/s);
});

test('sidebar roster forwards right click to the shared user context menu', () => {
  assert.match(home, /onContextMenu=/);
  assert.match(home, /sidebarContextRequest/);
  assert.match(home, /externalContextRequest=/);
  assert.match(membersPanel, /externalContextRequest/);
});

test('complete normal user action surface remains rendered for self targets', () => {
  const labels = [
    'Perfil', 'Mencionar', 'Mensagem', 'Iniciar chamada', 'Adicionar nota',
    'Adicionar apelido de amigo', 'Volume do usuário', 'Silenciar',
    'Silenciar efeitos sonoros', 'Desativar vídeo', 'Ver Código de Verificação',
    'Apps', 'Convidar para Campfire', 'Ignorar', 'Bloquear', 'Copiar ID do usuário',
  ];
  for (const label of labels) assert.match(menu, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(menu, /\{!self\s*&&\s*<button/);
  assert.doesNotMatch(menu, /\{!self\s*&&\s*<div className="cfUserVolume"/);
  assert.match(menu, /disabled=\{self\}/);
  assert.match(menu, /\{isCurrentUserOwner\s*&&\s*<>/);
});

test('Copy User ID uses an Electron native clipboard bridge', () => {
  assert.match(main, /\bclipboard\b/);
  assert.match(main, /clipboard:write-text/);
  assert.match(main, /clipboard\.writeText/);
  assert.match(preload, /clipboard:\s*\{/);
  assert.match(preload, /clipboard:write-text/);
  assert.match(desktop, /clipboard:\s*\{/);
  assert.match(actions, /campfireDesktop\?\.clipboard/);
});
