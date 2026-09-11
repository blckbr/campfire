import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/AnimeBrowser.tsx', import.meta.url), 'utf8');

test('R6.5.1 fullscreen listener cleanup is typed as void-returning so TS2322 cannot recur', () => {
  assert.match(source, /let\s+unlisten\s*:\s*\(\)\s*=>\s*void\s*=\s*\(\)\s*=>\s*undefined\s*;/);
});
