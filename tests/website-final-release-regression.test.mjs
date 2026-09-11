import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../website/app.js', import.meta.url), 'utf8');

const expectedScreens = [
  'current-home-r66615.png',
  'current-call-r66615.png',
  'current-countdown-r66615.png',
];

test('final website uses the canonical R6.6.6.15 Campfire screenshots', () => {
  for (const name of expectedScreens) {
    assert.ok(html.includes(`./assets/screenshots/${name}`), `Missing screenshot reference: ${name}`);
  }
  assert.match(html, /product-window-shot|current-shot/);
  assert.match(html, /data-preview-src=/);
  assert.doesNotMatch(html, /site-(?:0[1-9]|1[0-2])-/);
});

test('screenshot lightbox renders the selected real image', () => {
  assert.match(html, /id="preview-image"/);
  assert.match(app, /button\.dataset\.previewSrc/);
  assert.match(app, /(?:dialogImg|previewImage)\.src/);
  assert.match(css, /\.preview-dialog/);
});
