import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../src/CampfireHome.tsx', import.meta.url), 'utf8');

test('R6.2 rail minimum ratios are used by clamp logic and cannot become TS6133 dead declarations', () => {
  assert.match(home, /const LEFT_RAIL_MIN_RATIO = 0\.75/);
  assert.match(home, /const RIGHT_RAIL_MIN_RATIO = 0\.75/);
  assert.match(home, /const minRatio = side === "left" \? LEFT_RAIL_MIN_RATIO : RIGHT_RAIL_MIN_RATIO/);
  assert.match(home, /Math\.round\(max \* minRatio\)/);
});
