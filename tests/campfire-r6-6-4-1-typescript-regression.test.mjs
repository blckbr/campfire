import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'src', 'CampfireExpiryCountdown.tsx'), 'utf8');

test('R6.6.4.1 countdown does not shadow the Twenty Four font detector with boolean state', () => {
  assert.match(source, /function\s+detectTwentyFourFont\s*\(\)\s*:\s*boolean/);
  assert.doesNotMatch(source, /const\s*\[\s*hasTwentyFourFont\s*,\s*setHasTwentyFourFont\s*\]/);
  assert.match(source, /setTwentyFourFontAvailable\(detectTwentyFourFont\(\)\)/);
});
