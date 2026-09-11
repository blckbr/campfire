import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const hook = read("src/useCampfires.ts");
const home = read("src/CampfireHome.tsx");

const migrationPath = "supabase/migrations/20260908224000_campfire_r2_call_creation.sql";
const coverServicePath = "src/campfireCovers.ts";
const coverPickerPath = "src/CampfireCoverPicker.tsx";

test("Campfire creation uses one Campfire as one call with explicit lifecycle and shared cover", () => {
  assert.match(hook, /export type CampfireCoverKind/);
  assert.match(hook, /export type CampfireLifecycleType/);
  assert.match(hook, /export type CreateCampfireInput/);
  assert.match(hook, /persistent:\s*input\.lifecycle\s*===\s*["']permanent["']/);
  assert.match(hook, /create_campfire_r2/);
  assert.match(home, /Permanente/);
  assert.match(home, /Temporária/);
  assert.match(home, /CampfireCoverPicker/);
});

test("R2 migration persists cover metadata and exposes an idempotent creation RPC", () => {
  assert.equal(fs.existsSync(migrationPath), true, `missing ${migrationPath}`);
  const sql = read(migrationPath);
  assert.match(sql, /add column if not exists cover_kind/i);
  assert.match(sql, /add column if not exists cover_ref/i);
  assert.match(sql, /create or replace function public\.create_campfire_r2/i);
  assert.match(sql, /p_persistent boolean/i);
  assert.match(sql, /p_cover_kind text/i);
  assert.match(sql, /p_cover_ref text/i);
  assert.match(sql, /interval '5 minutes'/i);
  assert.match(sql, /campfire-covers/i);
  assert.match(sql, /create or replace function public\.get_my_campfire_visuals/i);
});

test("local cover files are uploaded to shared storage and remote URLs are validated", () => {
  assert.equal(fs.existsSync(coverServicePath), true, `missing ${coverServicePath}`);
  assert.equal(fs.existsSync(coverPickerPath), true, `missing ${coverPickerPath}`);
  const covers = read(coverServicePath);
  assert.match(covers, /CAMPFIRE_COVER_PRESETS/);
  assert.match(covers, /campfire-covers/);
  assert.match(covers, /uploadCampfireCover/);
  assert.match(covers, /validateRemoteCoverUrl/);
  assert.match(covers, /https?:/i);
  assert.doesNotMatch(covers, /C:\\\\/);
});
