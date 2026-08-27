import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/useCampfireLiveKitBroadcast.ts', import.meta.url), 'utf8');

test('LiveKit broadcast Realtime topic is unique across same-millisecond StrictMode mounts', () => {
  assert.match(source, /randomUUID|Math\.random\(\)/, 'topic needs randomness, Date.now alone can be reused');
  assert.doesNotMatch(source, /campfire-screen-db-\$\{campfireId\}-\$\{Date\.now\(\)\}`/, 'Date.now-only topic can be reused in the same millisecond');
});

test('postgres_changes callback is registered before subscribe', () => {
  const start = source.indexOf('campfire-screen-db-');
  assert.ok(start >= 0, 'screen realtime channel missing');
  const block = source.slice(start, start + 1000);
  assert.ok(block.indexOf('.on("postgres_changes"') >= 0, 'postgres_changes callback missing');
  assert.ok(block.indexOf('.subscribe(') > block.indexOf('.on("postgres_changes"'), 'subscribe must happen after registering callbacks');
});
