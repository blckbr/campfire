import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = [
  'home','menu-arquivo','menu-contatos','amigos','criar-campfire','configuracoes',
  'idioma-escala','animes','tela-compartilhamento','voz-video','fechamento','sobre',
];

test('all twelve final screenshots physically exist', () => {
  names.forEach((name, index) => {
    const n = String(index + 1).padStart(2, '0');
    const full = path.join(root, 'website', 'assets', 'screenshots', `site-${n}-${name}.png`);
    assert.equal(fs.existsSync(full), true, `Missing ${full}`);
    assert.ok(fs.statSync(full).size > 50_000, `${full} is unexpectedly small`);
  });
});

test('hyper-real base and real alpha video physically exist', () => {
  const base = path.join(root, 'website', 'assets', 'fire', 'campfire-base-hyperreal.webp');
  const video = path.join(root, 'website', 'assets', 'fire', 'real-fire-alpha.webm');
  assert.equal(fs.existsSync(base), true);
  assert.equal(fs.existsSync(video), true);
  assert.ok(fs.statSync(base).size > 250_000);
  assert.ok(fs.statSync(video).size > 500_000);
});
