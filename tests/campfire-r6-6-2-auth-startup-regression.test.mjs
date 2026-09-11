import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const policyTs = path.join(root, 'src', 'campfireExternalLinkPolicy.ts');
const desktopTs = path.join(root, 'src', 'desktop.ts');
const launcher = path.join(root, 'ABRIR_CAMPFIRE_R6_6_6_15.bat');

async function loadPolicy() {
  assert.equal(fs.existsSync(policyTs), true, 'missing campfireExternalLinkPolicy.ts');
  const outDir = path.join(root, '.tmp-r662-policy');
  fs.rmSync(outDir, { recursive: true, force: true });
  const emptyTypeRoots = path.join(outDir, 'types');
  fs.mkdirSync(emptyTypeRoots, { recursive: true });
  const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const useLocalTsc = fs.existsSync(tscJs);
  const command = useLocalTsc ? process.execPath : (process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const compiled = spawnSync(command, [
    ...(useLocalTsc ? [tscJs] : []),
    policyTs,
    '--target', 'ES2022',
    '--module', 'ES2022',
    '--moduleResolution', 'bundler',
    '--outDir', outDir,
    '--typeRoots', emptyTypeRoots,
    '--skipLibCheck',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(compiled.status, 0, `policy compile failed: ${compiled.error?.message ?? ''}\n${compiled.stdout ?? ''}\n${compiled.stderr ?? ''}`);
  const js = path.join(outDir, 'campfireExternalLinkPolicy.js');
  return import(`${pathToFileURL(js).href}?t=${Date.now()}`);
}

test('R6.6.2 never prompts for the configured Supabase OAuth authorize URL', async () => {
  const { shouldConfirmExternalUrl } = await loadPolicy();
  const supabase = 'https://example-project.supabase.co';
  const oauth = `${supabase}/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fcallback`;
  assert.equal(shouldConfirmExternalUrl(oauth, true, supabase), false);
});

test('R6.6.2 still confirms unrelated external links when the preference is enabled', async () => {
  const { shouldConfirmExternalUrl } = await loadPolicy();
  const supabase = 'https://example-project.supabase.co';
  assert.equal(shouldConfirmExternalUrl('https://example.com/download', true, supabase), true);
  assert.equal(shouldConfirmExternalUrl('https://example.com/download', false, supabase), false);
});

test('desktop openUrl uses the auth-aware external-link policy instead of prompting OAuth blindly', () => {
  const source = fs.readFileSync(desktopTs, 'utf8');
  assert.match(source, /shouldConfirmExternalUrl/);
  assert.match(source, /VITE_SUPABASE_URL/);
  assert.doesNotMatch(source, /if \(preferences\.confirmExternalLinks\) \{\s*const accepted = window\.confirm/);
});

test('R6.6.2 launcher opens the production dist directly and never starts Vite dev mode', () => {
  assert.equal(fs.existsSync(launcher), true, 'missing production launcher');
  const source = fs.readFileSync(launcher, 'utf8');
  assert.match(source, /electron\\dist\\electron\.exe/i);
  assert.match(source, /electron\\dist\\electron\.exe/i);
  assert.doesNotMatch(source, /electron:dev|npm run dev:web|vite/i);
});
