import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../website/app.js', import.meta.url), 'utf8');

test('fire uses a static hyper-real base plus captured real flame video', () => {
  assert.match(html, /assets\/fire\/campfire-base-hyperreal\.webp/);
  assert.match(html, /assets\/fire\/real-fire-alpha\.webm/);
  assert.match(html, /class="fire-base"/);
  assert.match(html, /class="real-fire-video"/);
  assert.doesNotMatch(html, /campfire-realistic-approved\.png|fire-canvas|campfire-flames-real\.webp/);
  assert.doesNotMatch(app, /THREE|WebGLRenderer|drawFlame|fireStage\.style\.transform/);
});

test('global click feeds only the real flame video with bounded energy and smooth decay', () => {
  assert.match(app, /target\s*=\s*Math\.min\(\.92,\s*target\s*\+\s*\.24\)/);
  assert.match(app, /target\s*\+=\s*\(0\s*-\s*target\)/);
  assert.match(app, /energy\s*\+=\s*\(target\s*-\s*energy\)/);
  assert.match(app, /realFire\.style\.transform/);
  assert.match(app, /const scaleY = 1 \+ energy \* 0\.62/);
  assert.doesNotMatch(app, /fireStage\.style\.transform|fireBase\.style\.transform/);
});

test('apex name appears only at high fire energy', () => {
  assert.match(html, /id="fire-apex-name"[^>]*>CAMPFIRE</);
  assert.match(app, /const nameLevel = Math\.max/);
  assert.match(app, /--name-level/);
});

test('sparks are secondary and reduced-motion is respected', () => {
  assert.match(app, /spawnSpark/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(html, /id="spark-layer"/);
});
