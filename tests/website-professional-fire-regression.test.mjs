import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../website/app.js', import.meta.url), 'utf8');

const baseRule = css.match(/\.fire-stage-v3 \.fire-base\{([^}]*)\}/s)?.[1] ?? '';
const videoRule = css.match(/\.fire-stage-v3 \.real-fire-video\{([^}]*)\}/s)?.[1] ?? '';

test('logs, embers and ash are a static hyper-real layer', () => {
  assert.match(html, /class="fire-base"/);
  assert.match(baseRule, /position:absolute/);
  assert.match(baseRule, /object-fit:contain/);
  assert.match(baseRule, /transform:none!important/);
  assert.doesNotMatch(app, /fireBase\.style\.transform/);
});

test('captured real flame video is the only scalable fire media', () => {
  assert.match(html, /class="real-fire-video"/);
  assert.match(html, /real-fire-alpha\.webm/);
  assert.match(videoRule, /transform-origin:50% 100%/);
  assert.match(app, /realFire\.style\.transform/);
  assert.match(app, /playbackRate/);
  assert.match(app, /brightness\(/);
  assert.doesNotMatch(app, /fireStage\.style\.transform/);
});

test('apex name is energy-driven and dissolves with the fire', () => {
  assert.match(html, /id="fire-apex-name"/);
  assert.match(app, /nameLevel/);
  assert.match(css, /--name-level/);
});

test('professional hero contains real Campfire screenshots', () => {
  assert.match(html, /floating-shot/);
  assert.match(html, /site-01-home\.png/);
  assert.match(html, /site-07-idioma-escala\.png/);
  assert.match(html, /site-10-voz-video\.png/);
  assert.match(html, /site-08-animes\.png/);
});
