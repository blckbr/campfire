import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('CampfireWeb has an explicit browser runtime with stable per-tab connection identity', () => {
  assert.ok(exists('src/web/platform.ts'));
  const platform = read('src/web/platform.ts');
  assert.match(platform, /isCampfireDesktop/);
  assert.match(platform, /sessionStorage/);
  assert.match(platform, /crypto\.randomUUID/);
  assert.match(platform, /\/invite\//);
  assert.match(platform, /\/auth\/callback/);
});

test('OAuth and desktop compatibility do not require the Electron bridge on the Web', () => {
  const app = read('src/App.tsx');
  const desktop = read('src/desktop.ts');
  const auth = read('src/AuthScreen.tsx');
  assert.match(app, /webOAuthCallbackUrl/);
  assert.match(app, /\/auth\/callback/);
  assert.match(desktop, /isCampfireDesktop/);
  assert.match(desktop, /window\.location/);
  assert.match(auth, /webOAuthRedirectUrl/);
});

test('CampfireWeb is an installable PWA and never caches private Supabase traffic', () => {
  for (const file of ['public/manifest.webmanifest', 'public/sw.js', 'public/_redirects', 'public/_headers']) {
    assert.ok(exists(file), `${file} missing`);
  }
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Campfire');
  const sw = read('public/sw.js');
  for (const api of ['/rest/v1', '/auth/v1', '/functions/v1', '/storage/v1']) {
    assert.match(sw, new RegExp(api.replaceAll('/', '\\/')));
  }
  assert.match(sw, /request\.method !== ['"]GET['"]/);
  const redirects = read('public/_redirects');
  assert.match(redirects, /\/invite\/\*/);
  assert.match(redirects, /\/auth\/callback/);
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['build:campfireweb'], /vite build --mode web/);
  const vite = read('vite.config.ts');
  assert.match(vite, /mode === ["']web["']/);
});

test('CampfireWeb backend keeps guests separate and invite secrets hashed', () => {
  const migrationPath = 'supabase/migrations/20260828073000_campfire_web_1_0.sql';
  assert.ok(exists(migrationPath));
  const sql = read(migrationPath);
  assert.match(sql, /create table if not exists public\.campfire_web_invites/i);
  assert.match(sql, /token_hash/i);
  assert.doesNotMatch(sql, /token_secret\s+text/i);
  assert.match(sql, /create table if not exists public\.campfire_guest_sessions/i);
  assert.match(sql, /create table if not exists public\.campfire_guest_messages/i);
  assert.match(sql, /can_participate_in_campfire/i);
  assert.match(sql, /acquire_campfire_media_lease/i);
  assert.match(sql, /guest.*never.*leadership|never.*leadership.*guest/i);
});

test('LiveKit tokens are connection-aware and authorize guests through server-side participation', () => {
  const edge = read('supabase/functions/campfire-media-token/index.ts');
  assert.match(edge, /connectionId/);
  assert.match(edge, /can_participate_in_campfire/);
  assert.match(edge, /principalId/);
  assert.match(edge, /identity:\s*`\$\{userId\}:\$\{connectionId\}`/);
  assert.match(edge, /acquire_campfire_media_lease/);
  const client = read('src/media/livekitToken.ts');
  assert.match(client, /connectionId/);
});

test('Guest invite route has no demo fallback and maintains server heartbeat', () => {
  assert.ok(exists('src/GuestCampfire.tsx'));
  const guest = read('src/GuestCampfire.tsx');
  assert.match(guest, /enter_campfire_as_guest/);
  assert.match(guest, /heartbeat_campfire_guest/);
  assert.match(guest, /send_campfire_guest_message/);
  assert.doesNotMatch(guest, /demoAccount|demoCampfires|demoInvite|modo de demonstração/i);
  const app = read('src/App.tsx');
  assert.match(app, /webInviteToken/);
  assert.match(app, /GuestCampfire/);
});

test('Permanent account chat reads a union timeline and refreshes on guest inserts', () => {
  const chat = read('src/useCampfireChat.ts');
  assert.match(chat, /get_campfire_web_messages/);
  assert.match(chat, /campfire_guest_messages/);
});

test('Web UI has safe native-feature fallback and mobile Campfires Chat Pessoas Mais navigation', () => {
  const home = read('src/CampfireHome.tsx');
  const css = read('src/App.css');
  assert.match(home, /Campfires/);
  assert.match(home, />\s*Chat\s*</);
  assert.match(home, />\s*Pessoas\s*</);
  assert.match(home, />\s*Mais\s*</);
  assert.match(css, /env\(safe-area-inset-bottom/);
  const anime = read('src/AnimeBrowser.tsx');
  assert.match(anime, /isCampfireWeb/);
  assert.match(anime, /Abrir externamente|Abrir no navegador/);
});

test('Cloudflare Pages download endpoint resolves the official 1.1.0 Windows and Linux release assets', () => {
  assert.ok(exists('functions/api/desktop-download.js'));
  const fn = read('functions/api/desktop-download.js');
  assert.match(fn, /releases\/latest/);
  assert.match(fn, /Campfire-Setup-1\.1\.0-x64\.exe/);
  assert.match(fn, /Campfire-Portable-1\.1\.0-x64\.exe/);
  assert.match(fn, /Campfire-1\.1\.0-linux-x86_64\.rpm/);
  assert.match(fn, /Campfire-1\.1\.0-linux-x86_64\.AppImage/);
  assert.match(fn, /302/);
  assert.match(fn, /Cache-Control/);
});

test('guest audio messages use the same private Campfire audio bucket with participant authorization', () => {
  const sql = read('supabase/migrations/20260828073000_campfire_web_1_0.sql');
  assert.match(sql, /send_campfire_guest_audio_message/);
  assert.match(sql, /campfire_audio_participant_read/);
  assert.match(sql, /campfire_audio_participant_insert/);
  const guest = read('src/GuestCampfire.tsx');
  assert.match(guest, /MediaRecorder/);
  assert.match(guest, /campfire-audio/);
  assert.match(guest, /send_campfire_guest_audio_message/);
});

test('voice maps connection-aware LiveKit identities back to principals and keeps the publishing lease alive', () => {
  const voice = read('src/useCampfireLiveKitVoice.ts');
  assert.match(voice, /principalIdFromParticipant/);
  assert.match(voice, /refresh_campfire_media_lease/);
  assert.match(voice, /release_campfire_media_lease/);
  assert.match(voice, /campfireConnectionId/);
});

test('participation helper exists before any guest-message RLS policy that calls it', () => {
  const sql = read('supabase/migrations/20260828073000_campfire_web_1_0.sql');
  const fn = sql.indexOf('create or replace function public.can_participate_in_campfire');
  const policy = sql.indexOf('create policy campfire_guest_messages_participant_read');
  assert.ok(fn >= 0 && policy >= 0 && fn < policy);
});

test('guest grace period is server-controlled and permanent messages are realtime-readable by active guests', () => {
  const sql = read('supabase/migrations/20260828073000_campfire_web_1_0.sql');
  assert.match(sql, /campfire_messages_web_participant_read/);
  const heartbeatStart = sql.indexOf('create or replace function public.heartbeat_campfire_guest');
  const heartbeatEnd = sql.indexOf('create or replace function public.leave_campfire_guest');
  const heartbeat = sql.slice(heartbeatStart, heartbeatEnd);
  assert.match(heartbeat, /campfire_members/);
  assert.match(heartbeat, /expires_at\s*=\s*case/i);
});

test('Web exposes installable-PWA affordance and a permanent Desktop download control', () => {
  assert.ok(exists('src/web/WebInstallControls.tsx'));
  const controls = read('src/web/WebInstallControls.tsx');
  assert.match(controls, /beforeinstallprompt/);
  assert.match(controls, /\/api\/desktop-download/);
  assert.match(controls, /Baixar Desktop/);
  const app = read('src/App.tsx');
  assert.match(app, /WebInstallControls/);
});

test('screen and Watch Together viewers do not consume the single publishing lease', () => {
  const client = read('src/media/livekitToken.ts');
  const edge = read('supabase/functions/campfire-media-token/index.ts');
  const broadcast = read('src/useCampfireLiveKitBroadcast.ts');
  assert.match(client, /publishing\?: boolean/);
  assert.match(edge, /publishing\?: boolean/);
  assert.match(edge, /wantsPublishing/);
  assert.match(broadcast, /connectRoom\(purpose, true\)/);
  assert.match(broadcast, /connectRoom\(session\.sessionType === "watch" \? "watch" : "screen", false\)/);
  assert.match(broadcast, /refresh_campfire_media_lease/);
  assert.match(broadcast, /release_campfire_media_lease/);
});

test('permanent Web accounts can opt into service-worker notifications for incoming chat while the app is running', () => {
  const pwa = read('src/web/pwa.ts');
  const controls = read('src/web/WebInstallControls.tsx');
  const chat = read('src/useCampfireChat.ts');
  assert.match(pwa, /showCampfireNotification/);
  assert.match(pwa, /showNotification/);
  assert.match(controls, /requestCampfireNotifications/);
  assert.match(chat, /showCampfireNotification/);
});


test('CampfireWeb typecheck is isolated from obsolete Desktop-only PDF sources', () => {
  assert.ok(exists('tsconfig.web.json'), 'tsconfig.web.json missing');
  const config = JSON.parse(read('tsconfig.web.json'));
  assert.ok(Array.isArray(config.exclude));
  assert.ok(config.exclude.includes('src/pdf/**/*'));
});
