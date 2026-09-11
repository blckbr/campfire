import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('Campfire 1.1.0 exposes approved Windows and Linux x64 targets', () => {
  assert.equal(pkg.version, '1.1.0');
  for (const script of ['dist:win', 'dist:win:portable', 'dist:linux:rpm', 'dist:linux:appimage']) {
    assert.equal(typeof pkg.scripts?.[script], 'string', `missing ${script}`);
  }
  assert.deepEqual(pkg.build.win.target, ['nsis', 'portable']);
  assert.deepEqual(pkg.build.linux.target, ['rpm', 'AppImage']);
  assert.equal(pkg.build.linux.category, 'Network');
  assert.match(pkg.build.win.artifactName, /Campfire-.*\$\{version\}/);
  assert.match(pkg.build.portable.artifactName, /Portable/);
  assert.match(pkg.build.linux.artifactName, /linux-\$\{arch\}/);
});
