import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('room member identity is username-only and social name is profile-only', () => {
  const panel = read('src/CampfireMembersPanel.tsx');
  const menu = read('src/UserContextMenu.tsx');
  const profile = read('src/CampfireUserProfileModal.tsx');
  const home = read('src/CampfireHome.tsx');
  assert.match(panel, /function\s+memberNick\s*\(/);
  assert.match(panel, /member\.username\s*\?\s*`@\$\{member\.username\}`/);
  assert.match(menu, /userNick\(target\)/);
  assert.doesNotMatch(menu, /<strong>\{displayName\(target\)\}<\/strong>/);
  assert.match(profile, /Nome social/);
  assert.match(profile, /target\.display_name/);
  assert.match(home, /campfire-open-profile/);
  assert.match(home, /<CampfireUserProfileModal/);
});

test('status picker is custom React UI instead of native select', () => {
  const panel = read('src/CampfireMembersPanel.tsx');
  assert.doesNotMatch(panel, /<select\b/);
  assert.match(panel, /campfireStatusPickerButton/);
  assert.match(panel, /role="listbox"/);
  assert.match(panel, /label:\s*"Invisível"/);
  assert.match(panel, /icon:\s*"○"/);
});

test('native Anime view is hidden while Campfire overlays are open and restored afterward', () => {
  const coordinator = read('src/campfireNativeOverlay.ts');
  const viewer = read('src/AnimeSourceWebview.tsx');
  const home = read('src/CampfireHome.tsx');
  const userMenu = read('src/UserContextMenu.tsx');
  assert.match(coordinator, /campfire-native-overlay-change/);
  assert.match(coordinator, /Set<string>/);
  assert.match(viewer, /isCampfireNativeOverlayBlocked/);
  assert.match(viewer, /webview\s*\.hide\(\)/);
  assert.match(viewer, /webview\s*\.show\(\)/);
  assert.match(home, /setCampfireNativeOverlayBlock/);
  assert.match(home, /showFriendsModal\s*\|\|\s*showSettings\s*\|\|\s*showCreate/);
  assert.match(home, /showMembers\s*\|\|/);
  assert.match(userMenu, /setCampfireNativeOverlayBlock/);
  assert.match(userMenu, /user-context-menu:/);
});

test('Campfire imports the exact MarshMallow Browser base palette last', () => {
  const theme = read('src/MarshMallowTheme.css');
  const main = read('src/main.tsx');
  for (const value of ['#020203', '#08080a', '#121216', '#f0f0f3', '#85858f', '#ededf1', '#09090b', '#8ed0a2', '#f47d86']) {
    assert.match(theme.toLowerCase(), new RegExp(value.replace('#', '#')));
  }
  const typographyIndex = main.indexOf('./CampfireTypography.css');
  const themeIndex = main.indexOf('./MarshMallowTheme.css');
  assert.ok(themeIndex > typographyIndex, 'MarshMallowTheme.css must be imported after existing global typography');
});

test('leadership transfer remains wired to the Supabase RPC', () => {
  const members = read('src/useCampfireMembers.ts');
  assert.match(members, /supabase\.rpc\(\s*["']transfer_campfire_leadership["']/);
  assert.match(members, /p_new_leader_id:\s*newLeaderId/);
});

test('room-facing chat screen share and shell never prefer social display names', () => {
  const home = read('src/CampfireHome.tsx');
  const chat = read('src/CampfireChat.tsx');
  const screen = read('src/CampfireScreenShare.tsx');

  assert.doesNotMatch(
    home,
    /profile\.display_name\s*\|\|\s*profile\.username/,
    'Campfire shell must not prefer social display_name over nick'
  );
  assert.doesNotMatch(
    chat,
    /message\.senderDisplayName\s*\|\|\s*message\.senderUsername/,
    'room chat must not prefer sender social display name'
  );
  assert.doesNotMatch(
    screen,
    /displayName\s*\|\|\s*username/,
    'screen-share host label must not prefer social display name'
  );
});
