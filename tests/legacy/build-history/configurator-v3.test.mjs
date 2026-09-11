import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const bat = readFileSync(new URL('../patch/CONFIGURAR_LIVEKIT_CAMPFIRE.bat', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../ABRIR_CONFIGURADOR_SEM_FECHAR.bat', import.meta.url), 'utf8');

test('V3 uses fixed validated Campfire project ref without FOR/F env parsing', () => {
  assert.match(bat, /set "PROJECT_REF=uomtavzjrwgxeeukaidt"/i);
  assert.match(bat, /\^\[a-z\]\{20\}\$/i);
  assert.doesNotMatch(bat, /for\s+\/f/i);
  assert.doesNotMatch(bat, /VITE_SUPABASE_URL/i);
});

test('V3 always uses Supabase CLI via npx and links exact project ref', () => {
  assert.match(bat, /npx\.cmd --yes supabase/i);
  assert.match(bat, /link --project-ref "%PROJECT_REF%"/i);
});

test('all errors converge to a visible pause and launcher uses cmd k', () => {
  assert.match(bat, /:fim_erro[\s\S]*pause[\s\S]*exit \/b 1/i);
  assert.match(launcher, /cmd\.exe \/d \/k/i);
});
