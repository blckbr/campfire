import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isBlockedAnimeRequest,
  shouldLoadPopupInAnimeView,
  animeCosmeticCss,
} from '../electron/lib/anime-content-blocker.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('anime blocker rejects known advertising and tracking hosts', () => {
  for (const url of [
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    'https://googleads.g.doubleclick.net/pagead/ads?client=x',
    'https://syndication.exoclick.com/ads.js',
    'https://www.popads.net/ad.js',
    'https://delivery.propellerads.com/popup.js',
    'https://a.realsrv.com/video.js',
    'https://cdn.monetag.com/push.js',
  ]) {
    assert.equal(isBlockedAnimeRequest(url), true, url);
  }
});

test('anime blocker keeps ordinary anime pages and video CDNs available', () => {
  for (const url of [
    'https://animefire.io/animes/serie-legal',
    'https://goyabu.io/video/episodio-1',
    'https://cdn.example.net/video/episode-01.m3u8',
    'https://media.example.org/chunk-001.ts',
  ]) {
    assert.equal(isBlockedAnimeRequest(url), false, url);
  }
});

test('popup policy only reuses the anime view for Campfire-approved anime hosts', () => {
  assert.equal(shouldLoadPopupInAnimeView('https://animefire.io/animes/x'), true);
  assert.equal(shouldLoadPopupInAnimeView('https://www.goyabu.io/episodio/x'), true);
  assert.equal(shouldLoadPopupInAnimeView('https://popads.net/landing'), false);
  assert.equal(shouldLoadPopupInAnimeView('https://unknown-ad-site.example/click'), false);
  assert.equal(shouldLoadPopupInAnimeView('javascript:alert(1)'), false);
});

test('cosmetic blocker hides common ad slots without hiding all iframes', () => {
  const css = animeCosmeticCss();
  assert.match(css, /adsbygoogle/);
  assert.match(css, /data-ad-slot/);
  assert.doesNotMatch(css, /iframe\s*\{/);
});

test('Electron isolates the ANIMES browser in its own partition and enables request blocking', () => {
  const main = read('electron/main.mjs');
  assert.match(main, /persist:campfire-anime/);
  assert.match(main, /onBeforeRequest/);
  assert.match(main, /isBlockedAnimeRequest/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /shouldLoadPopupInAnimeView/);
});
