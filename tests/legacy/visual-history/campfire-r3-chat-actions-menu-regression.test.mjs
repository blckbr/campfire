import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('chat is closed by default and opens only from the compact message action', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /type CampfireRoomTab\s*=\s*\| "stage"/);
  assert.match(home, /useState<\s*CampfireRoomTab\s*>\(\s*"stage"\s*\)/);
  assert.match(home, /setActiveTab\(\s*"stage"\s*\)/);
  assert.match(home, /className="campfireQuickActions"/);
  assert.match(home, /aria-label="Abrir conversa"/);
  assert.match(home, /campfireQuickActionBadge/);
  assert.match(home, /activeTab ===\s*"messages"[\s\S]*campfireChatOverlay/);
});

test('unread counter stays realtime and resets when the user opens messages', () => {
  const home = read('src/CampfireHome.tsx');
  const events = read('src/useCampfireRoomEvents.ts');
  assert.match(home, /roomEvents\.unreadMessages/);
  assert.match(home, /roomEvents\s*\.markMessagesRead\(\)/);
  assert.match(events, /messagesTabActiveRef/);
  assert.match(events, /setUnreadMessages\(\s*0\s*\)/);
});

test('compact action strip keeps media and room actions in the upper-right without a permanent tab bar', () => {
  const home = read('src/CampfireHome.tsx');
  const css = read('src/CampfireR3Shell.css');
  assert.match(home, /campfireQuickActions/);
  for (const label of ['Abrir conversa','Compartilhar tela','Abrir Anime','Participantes','Tema desta Campfire']) {
    assert.match(home, new RegExp(label));
  }
  assert.match(css, /\.campfireQuickActions\s*\{[^}]*position:\s*absolute[^}]*right:/s);
  assert.match(css, /\.campfireQuickActionButton/);
});

test('main menus use roll-down animation and occupy the top overlay layer', () => {
  const css = read('src/CampfireR3Shell.css');
  const home = read('src/CampfireHome.tsx');
  assert.match(css, /@keyframes campfireRollDown/);
  assert.match(css, /\.blackPianoTheme \.blackPianoMenuBar\s*\{[^}]*z-index:\s*30000/s);
  assert.match(css, /\.blackPianoMenuDropdown\s*\{[^}]*animation:\s*campfireRollDown/s);
  assert.match(home, /activeAppMenu !== null/);
  assert.match(home, /setCampfireNativeOverlayBlock/);
});

test('chat visual exposes Messages Files and Pins with a large empty-state composition', () => {
  const chat = read('src/CampfireChat.tsx');
  const css = read('src/CampfireChat.css');
  assert.match(chat, /campfireChatTopTabs/);
  assert.match(chat, /Mensagens<\/button>/);
  assert.match(chat, /Arquivos<\/button>/);
  assert.match(chat, /Fixados<\/button>/);
  assert.match(chat, /campfireChatWelcome/);
  assert.match(css, /\.campfireChatTopTabs\s*\{/);
  assert.match(css, /\.campfireChatWelcome[,\s\{]/);
});
