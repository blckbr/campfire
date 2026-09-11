import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const home = fs.readFileSync(path.resolve(here, '..', 'src', 'CampfireHome.tsx'), 'utf8');

const campfireHomeIndex = home.indexOf('function CampfireHome(');
const campfireViewIndex = home.indexOf('function CampfireView(');
const newsFallbackIndex = home.indexOf('function resolveNewsFallbackUrl(');
const newsImageImportIndex = home.indexOf('import CampfireNewsImage');

test('news image component and fallback helper stay module-scoped for CampfireHome', () => {
  assert.ok(newsImageImportIndex >= 0, 'CampfireNewsImage import must exist');
  assert.ok(newsFallbackIndex >= 0, 'resolveNewsFallbackUrl must exist');
  assert.ok(newsFallbackIndex < campfireHomeIndex, 'resolveNewsFallbackUrl must be declared before CampfireHome');
  assert.match(home, /<CampfireNewsImage[\s\S]*fallbackUrl=\{resolveNewsFallbackUrl\(/);
  assert.doesNotMatch(home, /function resolveNewsPreviewUrl\(/);
});

test('CampfireView receives settings opener from CampfireHome instead of referencing parent state setter', () => {
  const propsBlock = home.slice(home.indexOf('type CampfireViewProps = {'), campfireViewIndex);
  const componentBlock = home.slice(campfireViewIndex);
  const invocationStart = home.indexOf('<CampfireView');
  const invocationEnd = home.indexOf('/>', invocationStart);
  const invocation = home.slice(invocationStart, invocationEnd);

  assert.match(propsBlock, /onOpenSettings:\s*\(\)\s*=>\s*void;/);
  assert.match(invocation, /onOpenSettings=\{\(\)\s*=>\s*setShowSettings\(true\)\}/);
  assert.match(componentBlock, /onOpenSettings,/);
  assert.doesNotMatch(componentBlock, /setShowSettings\(true\)/);
  assert.match(componentBlock, /onClick=\{onOpenSettings\}/);
});
