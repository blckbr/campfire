import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));

const settings = read('src/CampfireSettingsModal.tsx');
const settingsCss = read('src/CampfireSettingsModal.css');
const home = read('src/CampfireHome.tsx');
const themesCss = read('src/CampfireThemes.css');
let frames = '';
let frameCss = '';
try { frames = read('src/campfireWindowFrames.ts'); } catch {}
try { frameCss = read('src/CampfireWindowFrames.css'); } catch {}

test('R6.4 settings exposes separate Temas and Molduras com textura sections in the approved appearance menu', () => {
  for (const tab of ['general','media','themes','frames']) assert.match(settings, new RegExp(`\"${tab}\"`));
  assert.match(settings, />.*Temas.*<\/button>/s);
  assert.match(settings, />.*Molduras com textura.*<\/button>/s);
  for (const label of ['Notificações','Privacidade','Conexões','Atalhos','Avançado']) {
    assert.match(settings, new RegExp(label));
  }
  assert.match(settings, /Aparência e texturas/);
  assert.match(settingsCss, /\.campfireSettingsHero/);
  assert.match(settingsCss, /\.campfireSettingsTextureGrid/);
});

test('R6.4 textured frames are independent user preferences and include the approved material families', () => {
  assert.match(frames, /CampfireWindowFrameId/);
  assert.match(frames, /loadCampfireWindowFrame/);
  assert.match(frames, /saveCampfireWindowFrame/);
  for (const id of [
    'none','marshmallow-color','marshmallow-white','marshmallow-toasted','marshmallow-pink','marshmallow-night',
    'silver','emerald','sapphire','blood-red','ruby'
  ]) {
    assert.match(frames, new RegExp(`id:\\s*"${id}"`));
  }
  assert.match(home, /data-campfire-frame=\{activeWindowFrame\}/);
});

test('R6.4 texture assets are raster previews taken into the product and are used only by the window frame layer', () => {
  for (const name of [
    'marshmallow-color.png','marshmallow-white.png','marshmallow-toasted.png','marshmallow-pink.png','marshmallow-night.png',
    'silver.png','emerald.png','sapphire.png','blood-red.png','ruby.png'
  ]) {
    assert.equal(exists(`src/assets/window-frames/${name}`), true, `missing ${name}`);
  }
  assert.match(frameCss, /\.blackPianoTheme\[data-campfire-frame/);
  assert.match(frameCss, /::before/);
  assert.match(frameCss, /::after/);
  assert.match(frameCss, /--cf-window-frame-top-thickness/);
  assert.match(frameCss, /--cf-window-frame-side-thickness/);
  assert.doesNotMatch(frameCss, /mask-composite:\s*exclude/);
  assert.doesNotMatch(themesCss, /Global chrome compositor:[\s\S]*background-image:\s*var\(--cf-material-texture\)/);
});

test('R6.4 settings frame picker shows the approved textured backgrounds rather than procedural stripe swatches', () => {
  assert.match(settings, /CAMPFIRE_WINDOW_FRAMES/);
  assert.match(settings, /campfireSettingsFrameCard/);
  assert.match(settings, /frame\.preview/);
  assert.doesNotMatch(settings, /linear-gradient\(135deg,rgba\(255,151,207/);
});
