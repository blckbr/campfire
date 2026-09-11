import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const localVerifier = path.resolve('scripts/verify-campfireweb-build.mjs');
const publicVerifier = path.resolve('scripts/verify-campfireweb-public.mjs');
const SUPABASE_URL = 'https://example.supabase.co';
const SUPABASE_KEY = 'sb_publishable_split_chunk_example';

function writeFixture(root) {
  fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, '.env.web.local'), `VITE_SUPABASE_URL=${SUPABASE_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_KEY}\n`);
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<div id="root"></div><script type="module" src="/assets/index-ENTRY.js"></script>');
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'index-ENTRY.js'), 'const load=()=>import("./App-SPLIT.js"); void load;');
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'App-SPLIT.js'), `const u=${JSON.stringify(SUPABASE_URL)};const k=${JSON.stringify(SUPABASE_KEY)};console.log(u,k);`);
  for (const name of ['_redirects', 'manifest.webmanifest', 'sw.js']) fs.writeFileSync(path.join(root, 'dist', name), 'ok');
}

test('local verifier accepts Supabase config located in a dynamically imported App chunk', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campfire-split-local-'));
  try {
    writeFixture(temp);
    const run = spawnSync(process.execPath, [localVerifier], {
      cwd: temp,
      env: { ...process.env, CAMPFIRE_DESKTOP_SOURCE: path.join(temp, 'no-desktop') },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('public verifier follows JavaScript chunk references before checking Supabase config', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campfire-split-public-'));
  writeFixture(temp);

  const files = new Map([
    ['/', fs.readFileSync(path.join(temp, 'dist', 'index.html'))],
    ['/app/', fs.readFileSync(path.join(temp, 'dist', 'index.html'))],
    ['/assets/index-ENTRY.js', fs.readFileSync(path.join(temp, 'dist', 'assets', 'index-ENTRY.js'))],
    ['/assets/App-SPLIT.js', fs.readFileSync(path.join(temp, 'dist', 'assets', 'App-SPLIT.js'))],
  ]);

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const body = files.get(pathname);
    if (!body) { res.statusCode = 404; res.end('not found'); return; }
    res.statusCode = 200;
    res.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [publicVerifier], {
        cwd: temp,
        env: {
          ...process.env,
          CAMPFIRE_DESKTOP_SOURCE: path.join(temp, 'no-desktop'),
          CAMPFIREWEB_PUBLIC_URL: `http://127.0.0.1:${port}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
