import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const platformTs = path.join(root, 'src', 'web', 'platform.ts');
const supabaseTs = path.join(root, 'src', 'lib', 'supabase.ts');

async function loadPlatform() {
  const outDir = path.join(root, '.tmp-campfireweb-oauth-platform');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const windowTypes = path.join(outDir, 'window-types.d.ts');
  const emptyTypeRoots = path.join(outDir, 'types');
  fs.mkdirSync(emptyTypeRoots, { recursive: true });
  fs.writeFileSync(windowTypes, 'interface Window { campfireDesktop?: unknown }\n', 'utf8');

  const localTsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const useLocalTsc = fs.existsSync(localTsc);
  const command = useLocalTsc ? process.execPath : (process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const args = [
    ...(useLocalTsc ? [localTsc] : []),
    platformTs,
    windowTypes,
    '--target', 'ES2022',
    '--module', 'ES2022',
    '--moduleResolution', 'bundler',
    '--outDir', outDir,
    '--typeRoots', emptyTypeRoots,
    '--skipLibCheck',
  ];

  const compiled = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(
    compiled.status,
    0,
    `platform compile failed: ${compiled.error?.message ?? ''}\n${compiled.stdout ?? ''}\n${compiled.stderr ?? ''}`,
  );

  const js = path.join(outDir, 'platform.js');
  const loaded = await import(`${pathToFileURL(js).href}?t=${Date.now()}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  return loaded;
}

function installWindow(href) {
  const url = new URL(href);
  globalThis.window = {
    location: {
      origin: url.origin,
      pathname: url.pathname,
      href: url.href,
      search: url.search,
      hash: url.hash,
    },
  };
}

test('CampfireWeb keeps PKCE redirect compatible with an exact /auth/callback allow-list', () => {
  const source = fs.readFileSync(supabaseTs, 'utf8');
  assert.doesNotMatch(
    source,
    /appendPkceFlowIdToRedirects\s*:\s*true/,
    'appending sb_flow_id changes the redirectTo URL and can make an exact Supabase allow-list fall back to Site URL',
  );
});

test('CampfireWeb recovers an OAuth code that Supabase returned to the Site URL root', async () => {
  const platform = await loadPlatform();
  installWindow('https://campfireweb.pages.dev/?code=oauth-code-123');

  assert.equal(
    platform.webOAuthCallbackUrl(),
    'https://campfireweb.pages.dev/auth/callback?code=oauth-code-123',
  );
});

test('CampfireWeb does not treat a normal root visit as an OAuth callback', async () => {
  const platform = await loadPlatform();
  installWindow('https://campfireweb.pages.dev/');
  assert.equal(platform.webOAuthCallbackUrl(), null);
});


test('CampfireWeb publisher gates deployment on the OAuth return regression', () => {
  const publisher = fs.readFileSync(path.join(root, 'CAMPFIREWEB_PUBLICAR.bat'), 'utf8');
  assert.match(publisher, /campfireweb-oauth-return-regression\.test\.mjs/i);
});
