import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }

const pkg = JSON.parse(read('package.json'));
const buildBat = read('BUILD_CAMPFIRE_RELEASE.bat');
const buildPs = read('scripts/build-release.ps1');
const publishBat = read('PUBLICAR_CAMPFIRE_FINAL.bat');
const publishPs = read('scripts/publish-final.ps1');
const verifyWorkflow = read('.github/workflows/verify.yml');

test('release build is pinned to Campfire 1.0.0 NSIS artifact and checksum', () => {
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.build.win.artifactName, 'Campfire-Black-Piano-Setup-${version}.${ext}');
  assert.match(buildPs, /\$Version = '1\.0\.0'/);
  assert.match(buildPs, /Campfire-Black-Piano-Setup-\$Version\.exe/);
  assert.match(buildPs, /Get-FileHash/);
  assert.match(buildPs, /npm\.cmd run verify/);
  assert.match(buildPs, /electron-builder/);
  assert.match(buildBat, /scripts\\build-release\.ps1/);
});

test('publisher pushes source and release to GitHub then deploys Cloudflare Pages', () => {
  assert.match(publishPs, /gh\.exe auth status|gh auth status/);
  assert.match(publishPs, /gh\.exe repo create|gh repo create/);
  assert.match(publishPs, /gh\.exe release create|gh release create/);
  assert.match(publishPs, /wrangler@latest/);
  assert.match(publishPs, /pages deploy/);
  assert.match(publishPs, /campfire-br/);
  assert.match(publishPs, /website\\assets\\screenshots/);
  assert.match(publishBat, /scripts\\publish-final\.ps1/);
});

test('GitHub CI verifies source but GitHub Pages deployment is removed', () => {
  assert.match(verifyWorkflow, /npm ci/);
  assert.match(verifyWorkflow, /npm run verify/);
  assert.ok(!fs.existsSync(new URL('../.github/workflows/pages.yml', import.meta.url)));
});

test('publisher keeps legacy Tauri, backups and updater payloads out of GitHub', () => {
  const ignore = read('.gitignore');
  for (const token of ['src-tauri/', 'backup-tauri/', '_campfire_voice_pro_update/', '_campfire_select_hotfix/', '_campfire_voice_dock_select_fix/']) {
    assert.ok(ignore.includes(token), `Missing ignore rule: ${token}`);
  }
  assert.match(publishPs, /git\.exe rm -r --cached --ignore-unmatch/);
  assert.match(publishPs, /src-tauri/);
});
