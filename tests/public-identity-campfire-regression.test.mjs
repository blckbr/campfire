import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => readFile(path.join(root, rel), 'utf8');

const artifacts = [
  'Campfire-Setup-1.1.0-x64.exe',
  'Campfire-Portable-1.1.0-x64.exe',
  'Campfire-1.1.0-linux-x86_64.rpm',
  'Campfire-1.1.0-linux-x86_64.AppImage'
];

test('public identity is Campfire, not Black Piano', async () => {
  const site = await read('website/index.html');
  const readme = await read('README.md');
  const notes = await read('RELEASE_NOTES_1.1.0.md');
  for (const [name, text] of [['website/index.html', site], ['README.md', readme], ['RELEASE_NOTES_1.1.0.md', notes]]) {
    assert.doesNotMatch(text, /black\s+piano/i, `${name} ainda usa a identidade antiga`);
  }
  assert.match(site, /<title>Campfire 1\.1\.0/);
  assert.match(site, /"name":"Campfire"/);
  assert.match(readme, /^# Campfire$/m);
  assert.match(notes, /^# Campfire 1\.1\.0$/m);
});

test('current public source keeps the approved Campfire 1.1.0 package identity', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const readme = await read('README.md');
  assert.equal(pkg.version, '1.1.0');
  assert.equal(pkg.productName, 'Campfire');
  for (const artifact of artifacts) assert.match(readme, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
