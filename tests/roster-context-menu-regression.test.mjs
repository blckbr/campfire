import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const home = read('src/CampfireHome.tsx');
const rooms = read('src/useCampfires.ts');
const rail = read('src/CampfireRightRail.tsx');
const railCss = read('src/CampfireRightRail.css');
const menu = read('src/UserContextMenu.tsx');
const membersPanel = read('src/CampfireMembersPanel.tsx');
const actions = read('src/useCampfireUserActions.ts');
const preload = read('electron/preload.cjs');
const main = read('electron/main.mjs');
const desktop = read('src/desktop.ts');

test('Campfire left rail stays Campfires-only while the right rail renders participants with avatars', () => {
  assert.match(rooms, /members:\s*CampfireRosterMember\[\]/);
  assert.match(rooms, /get_campfire_members/);
  assert.doesNotMatch(home, /className="campfireRoster"/);
  assert.match(home, /CampfireRightRail/);
  assert.match(rail, /members\.map/);
  assert.match(rail, /avatar_url/);
  assert.match(railCss, /\.campfireRightRail\s*\{[^}]*overflow:\s*auto/s);
  assert.doesNotMatch(rail, /🔥/);
});

test('right-rail participants forward right click to the shared user context menu host', () => {
  assert.match(rail, /onContextMenu=/);
  assert.match(rail, /onParticipantContextMenu/);
  assert.match(home, /railContextRequest/);
  assert.match(home, /externalContextRequest=\{\s*railContextRequest\s*\}/s);
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
