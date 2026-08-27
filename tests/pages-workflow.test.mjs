import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publish = fs.readFileSync(new URL('../scripts/publish-final.ps1', import.meta.url), 'utf8');

test('final website deploy uses Cloudflare Pages and GitHub Pages workflow is disabled', () => {
  assert.ok(!fs.existsSync(new URL('../.github/workflows/pages.yml', import.meta.url)));
  for (const token of [
    'wrangler@latest',
    'pages deploy',
    'campfire-br',
    'website',
    'gh.exe release create',
    'Campfire-Black-Piano-Setup-1.0.0.exe',
  ]) assert.ok(publish.includes(token), `Missing publish token: ${token}`);
});
