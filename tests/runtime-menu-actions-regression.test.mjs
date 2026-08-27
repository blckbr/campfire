import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('electron/main.mjs');
const menu = read('src/UserContextMenu.tsx');
const css = read('src/UserContextMenu.css');

test('Electron shell owns a native edit context menu for every editable text field', () => {
  assert.match(main, /\bMenu\b/);
  assert.match(main, /function\s+installEditableTextContextMenu\s*\(/);
  assert.match(main, /(?:webContents|wc)\.on\(['"]context-menu['"]/);
  assert.match(main, /if\s*\(\s*!params\.isEditable\s*\)\s*return/);
  for (const role of ['cut', 'copy', 'paste', 'selectAll']) {
    assert.match(main, new RegExp(`role:\\s*['"]${role}['"]`));
  }
  assert.match(main, /installEditableTextContextMenu\(\)/);
});

test('user actions that open another Campfire surface close the context menu first', () => {
  assert.match(menu, /function\s+dispatchAndClose\s*\(/);
  for (const eventName of [
    'campfire-mention-user',
    'campfire-open-direct-message',
    'campfire-start-direct-call',
    'campfire-show-verification-code',
  ]) {
    assert.match(menu, new RegExp(`dispatchAndClose\\([\\s\\S]*?${eventName}`));
  }
});

test('in-menu action results stay visible while the menu is scrollable', () => {
  assert.match(css, /\.cfUserContextMessage\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.cfUserContextMessage\s*\{[^}]*top:\s*0/s);
});

test('self-target menus explain why peer-only actions are unavailable instead of looking broken', () => {
  assert.match(menu, /cfUserContextSelfNotice/);
  assert.match(menu, /ações que exigem outro participante/i);
});



test('dispatch helper captures a non-null target id before nested callbacks', () => {
  assert.match(menu, /const\s+targetUserId\s*=\s*target\.id\s*;/);
  const start = menu.indexOf('function dispatchAndClose');
  const end = menu.indexOf('async function openInviteMenu', start);
  const helper = menu.slice(start, end);
  assert.match(helper, /callback\?\.\(targetUserId\)/);
  assert.doesNotMatch(helper, /target\.id/);
});
