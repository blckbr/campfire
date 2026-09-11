import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const themes = fs.readFileSync('src/CampfireThemes.css', 'utf8');
const css = fs.readFileSync('src/CampfireR4Shell.css', 'utf8');

test('all themes expose a translucent Aero liquid-glass chrome surface', () => {
  assert.match(themes, /--cf-glass-opacity:\s*\.5[02]?/);
  assert.match(themes, /--cf-liquid-glass:/);
  assert.match(themes, /--cf-chrome-surface:/);
  assert.match(themes, /--cf-glass-texture:/);
  assert.match(themes, /color-mix\(in srgb,var\(--cf-glass-tint\)\s+5[02]%,transparent\)/);
  for (const theme of ['silver-glow', 'emerald-glow', 'blood-red-glow', 'color-marshmallow-glow']) {
    const marker = `data-campfire-theme="${theme}"`;
    const start = themes.lastIndexOf(marker);
    assert.ok(start >= 0, `theme ${theme} must have a liquid-glass material override`);
    const blockEnd = themes.indexOf('}', start);
    assert.ok(blockEnd > start, `theme ${theme} material block must close`);
    assert.match(themes.slice(start, blockEnd + 1), /--cf-glass-texture:/);
  }
});

test('major chrome surfaces use backdrop blur and the same liquid-glass material', () => {
  for (const selector of [
    '.blackPianoTheme .blackPianoMenuBar',
    '.blackPianoTheme .topbar',
    '.blackPianoTheme .campfireLeftRail',
    '.blackPianoTheme .campfireRightRail',
    '.blackPianoTheme .campfireRoomHeader',
    '.blackPianoTheme .campfireSettingsModal',
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(css, new RegExp(`${escaped}[^{]*\\{[\\s\\S]*?background:\\s*var\\(--cf-chrome-surface\\)\\s*!important[\\s\\S]*?backdrop-filter:\\s*blur`, 'm'));
  }
});
