import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../website/app.js', import.meta.url), 'utf8');

test('approved fire is real captured media over a transparent hyper-real base', () => {
  assert.match(html, /campfire-base-hyperreal\.webp/);
  assert.match(html, /real-fire-alpha\.webm/);
  assert.match(html, /class="fire-stage fire-stage-v3"/);
  assert.doesNotMatch(html, /campfire-realistic-approved\.png|three@|importmap|fallback-log|fallback-flame|campfire-flames-real\.webp/);
  assert.doesNotMatch(app, /THREE|WebGLRenderer|CylinderGeometry|ShaderMaterial/);
  assert.match(css, /\.fire-base/);
  assert.match(css, /\.real-fire-video/);
});

test('only the captured flame layer responds to click energy', () => {
  assert.match(app, /realFire\.style\.transform/);
  assert.match(app, /scaleY\(\$\{scaleY\.toFixed\(3\)\}\)/);
  assert.doesNotMatch(app, /fireStage\.style\.transform|fireBase\.style\.transform/);
});

test('apex CAMPFIRE reveal returns from the original concept', () => {
  assert.match(html, /id="fire-apex-name"[^>]*>CAMPFIRE</);
  assert.match(app, /nameLevel/);
  assert.match(css, /\.fire-apex-name/);
});

test('hero keeps the approved centered title and primary actions', () => {
  assert.match(html, /id="hero-title">CAMPFIRE</);
  assert.match(html, /> Baixar para Windows</);
  assert.match(html, /> Ver no GitHub</);
  assert.match(html, /floating-shot/);
});
