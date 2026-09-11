import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const publisher = fs.readFileSync('CAMPFIREWEB_PUBLICAR.bat', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

test('CampfireWeb publisher prepares and validates public Supabase env before build/deploy', () => {
  assert.match(publisher, /prepare-campfireweb-env\.mjs/i);
  assert.match(publisher, /verify-campfireweb-build\.mjs/i);
  assert.match(publisher, /verify-campfireweb-public\.mjs/i);
  assert.match(publisher, /VITE_SUPABASE_URL/);
  assert.match(publisher, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test('CampfireWeb bootstrap does not statically import App before configuration guard', () => {
  assert.doesNotMatch(main, /^import App from ["']\.\/App["'];/m);
  assert.match(main, /CampfireWeb não configurado|CampfireWeb nao configurado/);
  assert.match(main, /import\(["']\.\/App["']\)/);
});

test('env preparer can import only public VITE settings from an existing desktop source', () => {
  const helper = path.resolve('scripts/prepare-campfireweb-env.mjs');
  assert.equal(fs.existsSync(helper), true, 'env preparer missing');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campfire-env-test-'));
  const webRoot = path.join(temp, 'web');
  const desktopRoot = path.join(temp, 'desktop');
  fs.mkdirSync(webRoot, { recursive: true });
  fs.mkdirSync(desktopRoot, { recursive: true });
  fs.writeFileSync(path.join(desktopRoot, '.env'), [
    'VITE_SUPABASE_URL=https://example.supabase.co',
    'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example',
    'SUPABASE_SERVICE_ROLE_KEY=DO_NOT_COPY',
    'LIVEKIT_API_SECRET=DO_NOT_COPY_EITHER',
    ''
  ].join('\n'));
  const run = spawnSync(process.execPath, [helper], {
    cwd: webRoot,
    env: { ...process.env, CAMPFIRE_DESKTOP_SOURCE: desktopRoot },
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const generated = fs.readFileSync(path.join(webRoot, '.env.web.local'), 'utf8');
  assert.match(generated, /VITE_SUPABASE_URL=https:\/\/example\.supabase\.co/);
  assert.match(generated, /VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example/);
  assert.match(generated, /VITE_CAMPFIRE_MEDIA_TRANSPORT=livekit/);
  assert.doesNotMatch(generated, /SERVICE_ROLE|LIVEKIT_API_SECRET|DO_NOT_COPY/);
  fs.rmSync(temp, { recursive: true, force: true });
});

test('env preparer fails closed when required public settings are unavailable', () => {
  const helper = path.resolve('scripts/prepare-campfireweb-env.mjs');
  assert.equal(fs.existsSync(helper), true, 'env preparer missing');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campfire-env-missing-'));
  const run = spawnSync(process.execPath, [helper], {
    cwd: temp,
    env: {
      PATH: process.env.PATH || '',
      CAMPFIRE_DESKTOP_SOURCE: path.join(temp, 'does-not-exist')
    },
    encoding: 'utf8'
  });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /VITE_SUPABASE_URL/);
  assert.match(`${run.stdout}\n${run.stderr}`, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  fs.rmSync(temp, { recursive: true, force: true });
});
