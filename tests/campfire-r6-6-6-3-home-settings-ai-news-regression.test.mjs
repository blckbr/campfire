import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const home = fs.readFileSync(path.join(root, 'src', 'CampfireHome.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'CampfireR6Shell.css'), 'utf8');

test('home topbar exposes a visible settings button beside the account area', () => {
  assert.match(home, /className="campfireTopbarAccount"[\s\S]*title="Configurações"[\s\S]*aria-label="Configurações"[\s\S]*setShowSettings\(true\)/);
});

test('home replaces the lower red/unused region with Campfire AI and clickable news panels', () => {
  assert.match(home, /campfireHomeUtilityGrid/);
  assert.match(home, /✨ IA do Campfire/);
  assert.match(home, /📰 Notícias importantes/);
  assert.match(home, /onClick=\{\(\) => void openUrl\(item\.url\)\}/);
  assert.match(css, /\.campfireHomeUtilityGrid\{/);
  assert.match(css, /\.campfireHomeAiPanel/);
  assert.match(css, /\.campfireHomeNewsPanel/);
});

test('news refresh cadence is exactly five minutes', () => {
  assert.match(home, /const CAMPFIRE_NEWS_REFRESH_MS = 5 \* 60 \* 1000;/);
  assert.match(home, /window\.setInterval\(\(\) => \{[\s\S]*loadNews\(\)[\s\S]*CAMPFIRE_NEWS_REFRESH_MS/);
});
