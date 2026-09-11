import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const home = fs.readFileSync(path.join(root, 'src', 'CampfireHome.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'CampfireR6Shell.css'), 'utf8');

test('home exposes visible settings from the account area', () => {
  assert.match(home, /className="campfireTopbarAccount"[\s\S]*title="Configurações"[\s\S]*aria-label="Configurações"[\s\S]*setShowSettings\(true\)/);
});

test('Campfire AI uses a free-form search field rather than predefined chips', () => {
  assert.match(home, /Pesquisa livre/);
  assert.match(home, /placeholder="Pesquise o que quiser com nossa IA"/);
  assert.match(home, /<textarea[\s\S]*campfireAiPrompt/);
  assert.doesNotMatch(home, /campfireHomeAiSuggestionRow/);
  assert.doesNotMatch(home, /campfireHomeAiChip/);
});

test('news feed refreshes every five minutes, scrolls, shows imagery, and opens articles', () => {
  assert.match(home, /const CAMPFIRE_NEWS_REFRESH_MS = 5 \* 60 \* 1000;/);
  assert.match(home, /campfireHomeNewsFeatured/);
  assert.match(home, /campfireHomeNewsGrid/);
  assert.match(home, /imageUrl/);
  assert.match(home, /openUrl\(item\.url\)/);
  assert.match(css, /\.campfireHomeNewsFeed\{[^}]*(?:overflow:auto|overflow-y:auto)/);
  assert.match(css, /\.campfireHomeNewsGrid\{[^}]*grid-template-columns:repeat\(2/);
});
