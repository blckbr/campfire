import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');

test('home exposes the final Campfire structure', () => {
  for (const token of [
    'CAMPFIRE',
    'Mais do que conversar.',
    'fire-stage-v3',
    'fire-base',
    'real-fire-video',
    'fire-apex-name',
    'floating-shot',
    'id="recursos"',
    'id="voz"',
    'id="screenshots"',
    'id="download"',
    'id="about"',
    'Baixar para Windows',
    'Deivison Santos',
    '@devsaex',
  ]) assert.ok(html.includes(token), `Missing HTML token: ${token}`);
});

test('site avoids remote fonts and has reduced-motion CSS', () => {
  assert.ok(!/fonts\.googleapis\.com|use\.typekit\.net/.test(html + css));
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
