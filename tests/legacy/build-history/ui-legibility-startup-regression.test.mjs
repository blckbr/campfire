import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/CampfireHome.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../INICIAR_CAMPFIRE.bat', import.meta.url), 'utf8');

test('Black Piano create-room modal explicitly overrides legacy light surfaces and text', () => {
  assert.match(css, /\.blackPianoTheme\s+\.privacyOptions\s+label[\s\S]*?background:\s*linear-gradient\([^}]+#1f242c[^}]+#12161b/i);
  assert.match(css, /\.blackPianoTheme\s+\.inviteFriends[\s\S]*?background:\s*#12161b/i);
  assert.match(css, /\.blackPianoTheme\s+\.temporaryNotice[\s\S]*?background:\s*rgba\(255,\s*164,\s*91/i);
  assert.match(css, /\.blackPianoTheme\s+\.vipHint[\s\S]*?background:\s*rgba\(153,\s*112,\s*210/i);
  assert.match(css, /\.blackPianoTheme\s+\.modalHeader\s+strong[\s\S]*?color:\s*#f3f6f9/i);
  assert.match(css, /\.blackPianoTheme\s+\.privacyOptions\s+small[\s\S]*?color:\s*#c2ccd6/i);
  assert.match(css, /\.inviteEmptyState/);
  assert.match(home, /className="inviteEmptyState"/);
  const emptyIndex = home.indexOf('className="inviteEmptyState"');
  assert.ok(emptyIndex >= 0);
  const emptyBlock = home.slice(emptyIndex, emptyIndex + 260);
  assert.doesNotMatch(emptyBlock, /fontSize:\s*"10px"/);
});

test('startup reveals main window on readiness without fixed delay and launcher never steals focus', () => {
  assert.match(main, /width:\s*560,\s*height:\s*460/);
  assert.match(main, /focusable:\s*false/);
  assert.match(main, /skipTaskbar:\s*true/);
  assert.match(main, /splashWindow\.showInactive\(\)/);
  assert.match(main, /mainWindow\.once\(['"]ready-to-show['"]/);
  assert.match(main, /const\s+mainLoadPromise\s*=/);
  assert.match(main, /const\s+splashLoadPromise\s*=/);
  assert.doesNotMatch(main, /setTimeout\([^\n]*1200/);
});


test('normal Windows launcher uses prebuilt renderer instead of starting Vite on every launch', () => {
  assert.match(launcher, /dist[\\\/]index\.html/i);
  assert.match(launcher, /electron\.exe/i);
  assert.match(launcher, /npm run build:web/i);
  assert.doesNotMatch(launcher, /npm run dev(?:\s|$)/i);
});
