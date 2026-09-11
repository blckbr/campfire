import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const marketing = read('website/index.html');
const marketingConfig = read('website/config.js');
const controls = read('src/web/WebInstallControls.tsx');
const api = read('functions/api/desktop-download.js');

const assets = {
  windowsSetup: 'Campfire-Setup-1.1.0-x64.exe',
  windowsPortable: 'Campfire-Portable-1.1.0-x64.exe',
  linuxRpm: 'Campfire-1.1.0-linux-x86_64.rpm',
  linuxAppImage: 'Campfire-1.1.0-linux-x86_64.AppImage',
};

test('marketing site exposes all four Campfire 1.1.0 download choices', () => {
  assert.match(marketingConfig, /https:\/\/campfireweb\.pages\.dev\/api\/desktop-download/);
  for (const kind of Object.keys(assets)) {
    assert.match(marketing, new RegExp(`data-download-kind=["']${kind}["']`));
    assert.match(marketingConfig, new RegExp(`asset=${kind}`));
  }
});

test('CampfireWeb exposes a permanent download menu for Windows and Linux packages', () => {
  assert.match(controls, /Baixar Desktop/);
  for (const kind of Object.keys(assets)) {
    assert.match(controls, new RegExp(`kind: [\"']${kind}[\"']`));
  }
  assert.match(controls, /\/api\/desktop-download\?asset=\$\{download\.kind\}/);
  assert.match(controls, /Windows Setup/);
  assert.match(controls, /Windows Portable/);
  assert.match(controls, /Linux RPM/);
  assert.match(controls, /Linux AppImage/);
});

test('Cloudflare download endpoint resolves the exact v1.1.0 assets and rejects unknown selections', () => {
  assert.match(api, /v1\.1\.0/);
  for (const [kind, filename] of Object.entries(assets)) {
    assert.match(api, new RegExp(`${kind}["']?\\s*:\\s*["']${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  }
  assert.match(api, /asset.*400|400.*asset/s);
  assert.doesNotMatch(api, /Campfire-Black-Piano-Setup-/);
});
