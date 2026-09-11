import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('src/CampfireHome.tsx', 'utf8');
const shell = fs.readFileSync('src/CampfireR6Shell.css', 'utf8');
const countdown = fs.readFileSync('src/CampfireExpiryCountdown.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

// Characterization gate for the three R6.6.6.15 screenshots approved on 2026-09-10.
test('current Simple Dark shell keeps the approved three-column Campfire structure', () => {
  assert.match(home, /CampfireRightRail/);
  assert.match(home, /CampfireExpiryCountdown/);
  assert.match(home, /className="sidebar campfireLeftRail"/);
  assert.match(home, /campfireSpotlightPrimary/);
  assert.match(home, /campfireParticipantTiles/);
  assert.match(shell, /\.blackPianoTheme/);
  assert.match(shell, /\.campfireLeftRail/);
  assert.match(shell, /\.campfireRightRail/);
});

test('current room header and call surface keep the approved actions', () => {
  for (const label of ['Conversa', 'Animes', 'Tela', 'Participantes', 'Configurações']) {
    assert.match(home, new RegExp(`>${label}<|>${label}\\s*<|<span>${label}</span>`));
  }
  assert.match(home, /campfireRoomActionButton/);
  for (const control of ['Microfone', 'Câmera', 'Abafar', 'Sair', 'Volume']) {
    assert.match(home, new RegExp(`>${control}<|>${control}\\s*<`));
  }
});

test('current empty-room state keeps countdown and rejoin without legacy theme UI', () => {
  assert.match(countdown, /role="timer"/);
  assert.match(countdown, /Campfire vazia/);
  assert.match(home, /Você saiu desta Campfire/);
  assert.match(home, /Rejoin Campfire/);
  const activeSurface = `${home}\n${main}`;
  assert.doesNotMatch(activeSurface, /Marshmallow Colorido|Galeria de temas|Selecionar tema/i);
  assert.doesNotMatch(activeSurface, /CampfireWindowFrames\.css/);
});
