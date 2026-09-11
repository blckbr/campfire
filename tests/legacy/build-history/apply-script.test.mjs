import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ps = fs.readFileSync(new URL('../scripts/apply-site-campfire-3d.ps1', import.meta.url), 'utf8');
const bat = fs.readFileSync(new URL('../APLICAR_SITE_CAMPFIRE_3D.bat', import.meta.url), 'utf8');

test('apply script targets canonical Campfire safely', () => {
  for (const token of ['C:\\messenger', 'package.json', 'electron\\main.mjs', '_site_backups', 'website', '.github\\workflows\\pages.yml']) {
    assert.ok(ps.includes(token), `Missing apply token: ${token}`);
  }
  assert.ok(bat.includes('apply-site-campfire-3d.ps1'));
});

test('apply script supports package extracted directly into C:\\messenger', () => {
  for (const token of [
    'Test-SamePath',
    '$inPlaceMode',
    'MODO IN-PLACE',
    'Restaurando website do backup mais recente',
    'Copy-Item -Path (Join-Path $latestBackup.FullName',
  ]) {
    assert.ok(ps.includes(token), `Missing in-place safety token: ${token}`);
  }
});

test('apply script never copies Pages workflow onto itself', () => {
  assert.ok(ps.includes('if (-not (Test-SamePath $sourceWorkflow $targetWorkflow))'));
});
