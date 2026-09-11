import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

async function loadResolver() {
  const source = path.join(root, 'src/news/newsImageCandidates.ts');
  assert.equal(fs.existsSync(source), true, 'news image candidate resolver missing');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campfire-news-candidates-'));
  const emptyTypeRoots = path.join(outDir, 'types');
  fs.mkdirSync(emptyTypeRoots, { recursive: true });
  const localTsc = path.join(root, 'node_modules/typescript/lib/tsc.js');
  const command = fs.existsSync(localTsc) ? process.execPath : (process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const args = [
    ...(fs.existsSync(localTsc) ? [localTsc] : []),
    source,
    path.join(root, 'src/news/newsImageTypes.ts'),
    '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'bundler',
    '--outDir', outDir, '--typeRoots', emptyTypeRoots, '--skipLibCheck'
  ];
  const compiled = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
  return import(`${pathToFileURL(path.join(outDir, 'newsImageCandidates.js')).href}?t=${Date.now()}`);
}

test('news candidates preserve approved priority order and normalize relative URLs', async () => {
  const { resolveNewsImageCandidates } = await loadResolver();
  const html = `<!doctype html><html><head>
    <meta property="og:image:secure_url" content="/images/hero-secure.jpg">
    <meta property="og:image" content="/images/hero.jpg">
    <meta name="twitter:image:src" content="https://cdn.example/twitter.webp">
    <script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"/images/jsonld.jpg"},"thumbnailUrl":"/images/thumb.jpg"}</script>
    <link rel="image_src" href="/images/link.jpg">
    <link rel="icon" href="/favicon.png">
  </head><body><article>
    <picture><source srcset="/images/small.jpg 640w, /images/large.jpg 1280w"></picture>
    <img data-src="/images/lazy.jpg" src="/images/article.jpg">
  </article></body></html>`;
  const result = resolveNewsImageCandidates(html, 'https://news.example/story/42', 'https://feed.example/feed.jpg');
  assert.deepEqual(result.map(x => x.source), [
    'feed', 'og:image', 'og:image', 'twitter:image', 'jsonld', 'jsonld', 'image_src', 'srcset', 'srcset', 'lazy', 'article', 'publisher-logo'
  ]);
  assert.equal(result[1].url, 'https://news.example/images/hero-secure.jpg');
  assert.equal(result.find(x => x.source === 'article').url, 'https://news.example/images/article.jpg');
});

test('news candidates deduplicate URLs and reject unsafe or obvious tracking images', async () => {
  const { resolveNewsImageCandidates } = await loadResolver();
  const html = `<meta property="og:image" content="javascript:alert(1)">
    <meta name="twitter:image" content="/pixel.gif">
    <img data-src="data:image/png;base64,abc">
    <img src="/real/photo.avif">
    <img src="/real/photo.avif">`;
  const result = resolveNewsImageCandidates(html, 'https://publisher.example/a');
  assert.deepEqual(result.map(x => x.url), ['https://publisher.example/real/photo.avif']);
});
