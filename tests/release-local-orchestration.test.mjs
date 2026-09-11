import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(file, 'utf8');

const stage1Path = 'scripts/release-1.1.0-local-stage1.ps1';
const stage2Path = 'scripts/release-1.1.0-local-stage2-github.ps1';
const linuxPath = 'scripts/build-linux-1.1.0-wsl.sh';
const batPath = 'RELEASE_CAMPFIRE_1_1_0_COMPLETA.bat';

test('local release orchestration builds native artifacts and Cloudflare before GitHub', () => {
  for (const file of [stage1Path, stage2Path, linuxPath, batPath]) {
    assert.ok(fs.existsSync(file), `${file} must exist`);
  }

  const stage1 = read(stage1Path);
  const stage2 = read(stage2Path);
  const linux = read(linuxPath);
  const bat = read(batPath);

  assert.match(stage1, /@\('run','verify'\)/i);
  assert.match(stage1, /@\('--win','nsis','--x64'\)/i);
  assert.match(stage1, /@\('--win','portable','--x64'\)/i);
  assert.match(stage1, /build-linux-1\.1\.0-wsl\.sh/i);
  assert.match(stage1, /'pages','deploy','website','--project-name','campfire-br'/i);
  assert.match(stage1, /'pages','deploy','dist','--project-name','campfireweb'/i);
  assert.doesNotMatch(stage1, /git\s+push|gh(?:\.exe)?\s+release\s+create/i);
  assert.match(stage1, /STAGE1_COMPLETE/i);

  assert.match(linux, /electron-builder.*--linux\s+rpm\s+--x64/is);
  assert.match(linux, /electron-builder.*--linux\s+AppImage\s+--x64/is);
  assert.match(linux, /rpm\s+-qip/i);
  assert.match(linux, /APPIMAGE_EXTRACT_AND_RUN=1/i);

  assert.match(stage2, /STAGE1_COMPLETE/i);
  assert.match(stage2, /v1\.1\.0/);
  assert.match(stage2, /'push','origin','main'/i);
  assert.match(stage2, /@\('release','create',\$Tag\)/i);
  assert.match(stage2, /Campfire-Setup-\$Version-x64\.exe/);
  assert.match(stage2, /Campfire-Portable-\$Version-x64\.exe/);
  assert.match(stage2, /Campfire-\$Version-linux-x86_64\.rpm/);
  assert.match(stage2, /Campfire-\$Version-linux-x86_64\.AppImage/);

  const stage1Call = bat.indexOf('release-1.1.0-local-stage1.ps1');
  const stage2Call = bat.indexOf('release-1.1.0-local-stage2-github.ps1');
  assert.ok(stage1Call >= 0 && stage2Call > stage1Call, 'master BAT must run Stage 1 before Stage 2');
});
