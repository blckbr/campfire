import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const anime = read('src/AnimeBrowser.tsx');
const members = read('src/CampfireMembersPanel.tsx');


test('main AnimeBrowser native WebView obeys the global Campfire overlay blocker', () => {
  assert.match(anime, /CAMPFIRE_NATIVE_OVERLAY_EVENT/);
  assert.match(anime, /isCampfireNativeOverlayBlocked/);
  assert.match(anime, /nativeOverlayBlockedRef/);
  assert.match(anime, /window\.addEventListener\(\s*CAMPFIRE_NATIVE_OVERLAY_EVENT/);
  assert.match(anime, /blocked\s*\|\|\s*!allowWebviewRevealRef\.current/);
  assert.match(anime, /await\s+webview\.hide\(\)/);
  assert.match(anime, /await\s+webview\.show\(\)/);
});


test('sidebar user context requests are consumed once instead of reopening after member refreshes', () => {
  assert.match(members, /lastExternalContextNonceRef/);
  assert.match(members, /externalContextRequest\.nonce\s*===\s*lastExternalContextNonceRef\.current/);
  assert.match(members, /lastExternalContextNonceRef\.current\s*=\s*externalContextRequest\.nonce/);
});
