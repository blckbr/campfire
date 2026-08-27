import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/campfire_media_pro.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260826142100_campfire_media_pro.sql', import.meta.url), 'utf8');

for (const [name, source] of [['source SQL', sql], ['migration', migration]]) {
  test(`${name} matches the original campfire_members schema`, () => {
    assert.match(source, /alter table public\.campfire_members\s+add column if not exists role text/i);
    assert.match(source, /left_at\s*=\s*now\(\)/i);
    assert.match(source, /new\.left_at\s+is\s+null/i);
    assert.match(source, /before insert or update of left_at on public\.campfire_members/i);
    assert.match(source, /old\.left_at\s+is\s+null/i);
    assert.match(source, /new\.left_at\s+is\s+not\s+null/i);
    assert.match(source, /m\.left_at\s+is\s+null/i);
    assert.doesNotMatch(source, /campfire_members\s+set\s+state\s*=/i);
    assert.doesNotMatch(source, /update of state on public\.campfire_members/i);
    assert.doesNotMatch(source, /\bnew\.state\b|\bold\.state\b|\bm\.state\b/i);
  });
}
