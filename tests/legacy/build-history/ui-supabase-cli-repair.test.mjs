import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8');
const config = readFileSync(new URL('../CONFIGURAR_LIVEKIT_CAMPFIRE.bat', import.meta.url), 'utf8');

test('startup optimization preserves isolated ANIMES partition and ad blocker', () => {
  assert.match(main, /const ANIME_PARTITION\s*=\s*['"]persist:campfire-anime['"]/);
  assert.match(main, /partition:\s*ANIME_PARTITION/);
  assert.match(main, /anime-content-blocker\.mjs/);
  assert.match(main, /configureAnimeSession\(animeSession\)/);
  assert.match(main, /focusable:\s*false/);
  assert.match(main, /skipTaskbar:\s*true/);
  assert.match(main, /ready-to-show/);
});

test('LiveKit configurator can bootstrap Supabase CLI through npx', () => {
  assert.match(config, /npx\.cmd\s+--yes\s+supabase/i);
  assert.match(config, /supabase\s+login/i);
  assert.match(config, /project-ref/i);
  assert.doesNotMatch(config, /Supabase CLI nao encontrado no PATH[\s\S]{0,120}exit \/b 1/i);
});
