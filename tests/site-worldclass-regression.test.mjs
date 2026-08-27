import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const website = new URL('../website/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', website), 'utf8');
const css = fs.readFileSync(new URL('styles.css', website), 'utf8');
const js = fs.readFileSync(new URL('app.js', website), 'utf8');

test('world-class site uses real captured fire over a static hyper-real base', () => {
  assert.match(html, /campfire-base-hyperreal\.webp/);
  assert.match(html, /real-fire-alpha\.webm/);
  assert.match(css, /\.fire-base/);
  assert.match(css, /\.real-fire-video/);
  assert.match(js, /realFire\.style\.transform/);
  assert.doesNotMatch(js, /drawFlame|WebGLRenderer|THREE/);
});

test('only the real flame layer grows when the fire is fed', () => {
  assert.match(js, /const scaleY = 1 \+ energy \* 0\.62/);
  assert.match(js, /realFire\.style\.transform/);
  assert.doesNotMatch(js, /fireStage\.style\.transform|fireBase\.style\.transform/);
});

test('the hero has no rectangular photo background', () => {
  assert.doesNotMatch(html, /campfire-realistic-approved\.png/);
  assert.match(html, /class="fire-base"/);
  assert.match(html, /class="real-fire-video"/);
});

test('Campfire name is an apex effect, not baked into the static base', () => {
  assert.match(html, /id="fire-apex-name"/);
  assert.match(js, /nameLevel/);
  assert.match(css, /\.fire-apex-name/);
});

test('all 12 confirmed Campfire screenshots are present', () => {
  for (let i = 1; i <= 12; i += 1) {
    const prefix = `site-${String(i).padStart(2, '0')}-`;
    assert.ok(html.includes(prefix), `Missing screenshot reference ${prefix}`);
  }
});

test('site remains static and release-aware', () => {
  assert.match(js, /releases\/latest/);
  assert.ok(fs.existsSync(new URL('assets/fire/campfire-base-hyperreal.webp', website)));
  assert.ok(fs.existsSync(new URL('assets/fire/real-fire-alpha.webm', website)));
});
