import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const finalLauncher = 'ABRIR_CAMPFIRE_R6_6_6_15.bat';
const staleLaunchers = [
  'ABRIR_CAMPFIRE_R6_6_2.bat',
  'ABRIR_CAMPFIRE_R6_6_3.bat',
];

test('canonical R6.6.6.15 source exposes only the final R6.6.6.15 launcher', () => {
  assert.equal(fs.existsSync(finalLauncher), true, `missing ${finalLauncher}`);
  for (const stale of staleLaunchers) {
    assert.equal(fs.existsSync(stale), false, `stale launcher must not remain: ${stale}`);
  }

  const source = fs.readFileSync(finalLauncher, 'utf8');
  assert.match(source, /C:\\messenger/);
  assert.match(source, /node_modules\\electron\\dist\\electron\.exe/);
  assert.match(source, /updater R6\.6\.6\.15/);
});
