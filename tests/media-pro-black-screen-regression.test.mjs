import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = readFileSync(new URL('../src/useCampfireLiveKitVoice.ts', import.meta.url), 'utf8');
const moderation = readFileSync(new URL('../src/useCampfireModeration.ts', import.meta.url), 'utf8');
const directCall = readFileSync(new URL('../src/useCampfireDirectCall.ts', import.meta.url), 'utf8');

test('LiveKit voice protects the shared private presence topic from React StrictMode channel reuse', () => {
  assert.match(voice, /supabase\s*\.getChannels\(\)/, 'voice must inspect stale local channels before recreating shared presence topic');
  assert.match(voice, /await\s+existing\.unsubscribe\(\)/, 'voice must unsubscribe stale same-topic channel before adding listeners');
  const cleanupIndex = voice.indexOf('await existing.unsubscribe()');
  const createIndex = voice.indexOf('supabase.channel(topic');
  assert.ok(cleanupIndex >= 0 && createIndex > cleanupIndex, 'cleanup must happen before channel creation');
});

test('Media Pro postgres-change helper channels use collision-resistant mount topics', () => {
  assert.match(moderation, /campfire-media-state-ui:[^`]*\$\{Date\.now\(\)\}[^`]*\$\{Math\.random\(\)/s);
  assert.match(directCall, /direct-call-ui:[^`]*\$\{Date\.now\(\)\}[^`]*\$\{Math\.random\(\)/s);
});
