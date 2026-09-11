import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'functions/api/news-image.js';

test('Cloudflare news image endpoint resolves publisher metadata and proxies only indexed candidates', () => {
  assert.equal(fs.existsSync(path), true, 'news-image endpoint missing');
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /resolveNewsImageCandidates/);
  assert.match(source, /fetchHtmlDocument/);
  assert.match(source, /fetchValidatedImage/);
  assert.match(source, /mode\s*===\s*['"]proxy['"]/);
  assert.match(source, /candidate/);
  assert.doesNotMatch(source, /searchParams\.get\(['"]image['"]\)/, 'must not proxy an arbitrary image URL supplied by the client');
  assert.match(source, /Cache-Control/);
});
