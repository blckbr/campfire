import test from 'node:test';
import assert from 'node:assert/strict';

async function security() {
  return import(`../functions/lib/news-image-security.js?t=${Date.now()}`);
}

test('news proxy rejects local private reserved and non-http targets', async () => {
  const { isAllowedPublicHttpUrl } = await security();
  for (const url of [
    'http://127.0.0.1/a',
    'http://localhost/a',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1/a',
    'http://172.16.0.1/a',
    'http://192.168.1.1/a',
    'http://[::1]/a',
    'http://[fe80::1]/a',
    'http://[fc00::1]/a',
    'file:///etc/passwd',
    'https://user:pass@example.com/a'
  ]) {
    assert.equal(await isAllowedPublicHttpUrl(url), false, url);
  }
  assert.equal(await isAllowedPublicHttpUrl('https://example.com/article'), true);
});

test('DNS validation fails closed if a hostname resolves to any private address', async () => {
  const { validatePublicHttpUrl } = await security();
  const privateResolver = async () => ['93.184.216.34', '10.0.0.4'];
  await assert.rejects(() => validatePublicHttpUrl('https://example.com/a', { resolver: privateResolver }), /private|reserved/i);
});

test('redirect fetch revalidates each Location and blocks private redirect abuse', async () => {
  const { fetchWithSafeRedirects } = await security();
  const resolver = async () => ['93.184.216.34'];
  const fakeFetch = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } });
  await assert.rejects(
    () => fetchWithSafeRedirects('https://example.com/article', { fetchImpl: fakeFetch, resolver }),
    /blocked|private|reserved/i
  );
});

test('limited body reader rejects declared or streamed payloads above the cap', async () => {
  const { readResponseBodyLimited } = await security();
  const declared = new Response('small', { headers: { 'content-length': '9000000' } });
  await assert.rejects(() => readResponseBodyLimited(declared, 1024), /too large/i);

  const streamed = new Response(new Uint8Array(2048));
  await assert.rejects(() => readResponseBodyLimited(streamed, 1024), /too large/i);
});

test('image content type allowlist accepts modern web imagery and rejects HTML', async () => {
  const { isAcceptedImageContentType } = await security();
  for (const type of ['image/jpeg','image/png','image/webp','image/gif','image/avif']) {
    assert.equal(isAcceptedImageContentType(type), true, type);
  }
  assert.equal(isAcceptedImageContentType('text/html'), false);
  assert.equal(isAcceptedImageContentType('image/svg+xml'), false);
});
