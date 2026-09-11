import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('package runs Campfire on Electron and no longer depends on Tauri', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, 'electron/main.mjs');
  assert.match(pkg.scripts.dev, /electron/i);
  assert.ok(pkg.devDependencies?.electron);
  assert.ok(pkg.devDependencies?.['electron-builder']);
  for (const name of Object.keys({...pkg.dependencies, ...pkg.devDependencies})) {
    assert.doesNotMatch(name, /^@tauri-apps\//);
  }
});

test('renderer source no longer imports the Tauri runtime', () => {
  const sourceFiles = fs.readdirSync(path.join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
  const joined = sourceFiles.map((f) => read(`src/${f}`)).join('\n');
  assert.doesNotMatch(joined, /@tauri-apps\//);
});

test('Electron uses WebContentsView for the embedded anime browser', () => {
  const main = read('electron/main.mjs');
  assert.match(main, /WebContentsView/);
  assert.match(main, /anime:create/);
  assert.match(main, /contentView\.addChildView/);
});

test('Watch Together captures the player frame directly with audio', () => {
  const main = read('electron/main.mjs');
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /framesInSubtree/);
  assert.match(main, /video:\s*frame/);
  assert.match(main, /audio:\s*request\.audioRequested\s*\?\s*frame/);
});

test('OAuth callback is owned by Electron and forwarded to React', () => {
  const main = read('electron/main.mjs');
  assert.match(main, /54321/);
  assert.match(main, /campfire-auth-callback/);
});

test('Campfire desktop bridge exposes safe APIs through contextBridge', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /contextBridge\.exposeInMainWorld\(['"]campfireDesktop['"]/);
  assert.match(preload, /anime:/);
  assert.match(preload, /watch:/);
  assert.match(preload, /shell:/);
});

test('typography accessibility layer raises tiny Black Piano text', () => {
  const css = read('src/CampfireTypography.css');
  assert.match(css, /font-size:\s*14px/);
  assert.match(css, /\.chatComposerInput/);
  assert.match(css, /font-size:\s*15px/);
  assert.match(css, /\.campfireTab/);
});

test('Electron release workflow is driven by verified npm packaging entrypoints', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.verify, /verify:source|build:web/);
  assert.ok(pkg.scripts.dist || pkg.scripts['dist:win'], 'Windows distribution entrypoint missing');
  assert.ok(pkg.scripts['dist:portable'] || pkg.scripts['dist:win:portable'], 'portable distribution entrypoint missing');
});


test('dev launcher can choose a free Vite port instead of forcing 1420', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.doesNotMatch(pkg.scripts['dev:web'], /--port\s+1420/);
  const vite = read('vite.config.ts');
  assert.match(vite, /CAMPFIRE_VITE_PORT/);
});

test('packaged renderer uses relative Vite asset paths and loadFile', () => {
  const vite = read('vite.config.ts');
  const main = read('electron/main.mjs');
  assert.match(vite, /base:\s*["']\.\/["']/);
  assert.match(main, /mainWindow\.loadFile\(path\.join\(DIST,\s*["']index\.html["']\)\)/);
});

test('packaged window icon resolves from Electron resources', () => {
  const main = read('electron/main.mjs');
  assert.match(main, /app\.isPackaged/);
  assert.match(main, /process\.resourcesPath/);
});
