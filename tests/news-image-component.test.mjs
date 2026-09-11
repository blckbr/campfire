import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');

test('Campfire news image component uses a real img with progressive error fallback', () => {
  assert.equal(exists('src/components/CampfireNewsImage.tsx'), true, 'component missing');
  const component = read('src/components/CampfireNewsImage.tsx');
  assert.match(component, /<img/);
  assert.match(component, /onError/);
  assert.match(component, /setIndex/);
  assert.match(component, /fallbackUrl/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /campfireNewsImageFallback/);
});

test('Home news cards use CampfireNewsImage instead of inline backgroundImage', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /CampfireNewsImage/);
  const newsStart = home.indexOf('className="campfireHomeNewsPanel"');
  const newsEnd = home.indexOf('</section>', newsStart);
  const block = home.slice(newsStart, newsEnd > newsStart ? newsEnd : undefined);
  assert.doesNotMatch(block, /backgroundImage/);
});

test('news image CSS preserves current card geometry with object-fit cover', () => {
  assert.equal(exists('src/components/CampfireNewsImage.css'), true, 'component CSS missing');
  const css = read('src/components/CampfireNewsImage.css');
  assert.match(css, /width:\s*100%/);
  assert.match(css, /height:\s*100%/);
  assert.match(css, /object-fit:\s*cover/);
});
