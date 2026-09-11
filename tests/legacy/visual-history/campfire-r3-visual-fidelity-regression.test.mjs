import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('preset cover URLs remain visible from Electron file:// production bundles', () => {
  const covers = read('src/campfireCovers.ts');
  assert.match(covers, /url:\s*"\.\/campfire-covers\//);
  assert.doesNotMatch(covers, /url:\s*"\/campfire-covers\//);
});

test('home uses the approved image-rich Black Piano shell instead of the legacy empty welcome card', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /campfireLeftHero/);
  assert.match(home, /campfireHomeBeautiful/);
  assert.match(home, /campfireHomeHero/);
  assert.match(home, /campfireHomeCampfireGrid/);
  assert.match(home, /campfireHomeRightRail/);
  assert.doesNotMatch(home, /<div className="welcome">/);
});

test('active Campfire stage follows mockup B with spotlight, mood image and participant tiles', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /campfireSpotlightCard/);
  assert.match(home, /campfireMoodCard/);
  assert.match(home, /campfireParticipantTiles/);
  assert.match(home, /campfireSpotlightAvatar/);
});

test('visual CSS allocates cinematic space instead of the compact R2 strip', () => {
  const css = read('src/CampfireR2Shell.css');
  assert.match(css, /\.campfireLeftHero\{/);
  assert.match(css, /\.campfireHomeBeautiful\{/);
  assert.match(css, /\.campfireSpotlightCard\{/);
  assert.match(css, /\.campfireMoodCard\{/);
  assert.match(css, /\.campfireParticipantTiles\{/);
  assert.doesNotMatch(css, /\.campfireStage\{[^}]*height:148px/);
});

test('desktop main menus remain visible as roll-down overlays above the immersive shell', () => {
  const css = read('src/CampfireR3Shell.css');
  assert.match(css, /\.blackPianoTheme \.blackPianoMenuBar\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /z-index:\s*30000/);
  assert.match(css, /@keyframes campfireRollDown/);
});


test('right rail mirrors the approved friends column with search and participant avatars', () => {
  const rail = read('src/CampfireRightRail.tsx');
  assert.match(rail, /campfireRightRailSearch/);
  assert.match(rail, /Buscar amigos/);
  assert.match(rail, /campfireRailAvatar/);
  assert.match(rail, /Participantes/);
});

test('all eight built-in cinematic cover assets are bundled locally', () => {
  for (const name of [
    'cinema-room.webp','campfire-lake.webp','tech-neon.webp','anime-sunset.webp',
    'black-piano.webp','gaming-neon.webp','aurora-sky.webp','travel-mountain.webp'
  ]) {
    const path = `public/campfire-covers/${name}`;
    assert.equal(fs.existsSync(path), true, `missing ${path}`);
    assert.ok(fs.statSync(path).size > 10000, `${path} should be a real visual asset`);
  }
});

test('retired legacy menu remains reachable through the compact unified menu', () => {
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /campfireUnifiedMenu/);
  assert.match(home, /showUnifiedMenu/);
  for (const label of ['Nova Campfire','Amigos','Configurações','Sobre o Campfire','Sair']) {
    assert.match(home, new RegExp(label));
  }
});

test('home stays image-rich even when the user has only a few Campfires', () => {
  const home = read('src/CampfireHome.tsx');
  const css = read('src/CampfireR3Shell.css');
  assert.match(home, /campfireHomeInspirationRow/);
  for (const label of ['Cinema','Games','Música','Viagens']) assert.match(home, new RegExp(label));
  assert.match(css, /\.campfireHomeInspirationRow/);
});
