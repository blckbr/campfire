import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../website/app.js', import.meta.url), 'utf8');

const expectedScreens = [
  'site-01-home.png','site-02-menu-arquivo.png','site-03-menu-contatos.png','site-04-amigos.png',
  'site-05-criar-campfire.png','site-06-configuracoes.png','site-07-idioma-escala.png','site-08-animes.png',
  'site-09-tela-compartilhamento.png','site-10-voz-video.png','site-11-fechamento.png','site-12-sobre.png',
];

test('final website uses all real Campfire screenshots', () => {
  for (const name of expectedScreens) {
    assert.ok(html.includes(`./assets/screenshots/${name}`), `Missing screenshot reference: ${name}`);
  }
  assert.match(html, /floating-shot/);
  assert.match(html, /data-preview-src=/);
});

test('screenshot lightbox renders the selected real image', () => {
  assert.match(html, /id="preview-image"/);
  assert.match(app, /button\.dataset\.previewSrc/);
  assert.match(app, /(?:dialogImg|previewImage)\.src/);
  assert.match(css, /\.preview-dialog/);
});
