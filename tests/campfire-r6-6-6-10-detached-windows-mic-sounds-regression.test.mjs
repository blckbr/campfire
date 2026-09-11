import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (p) => fs.readFileSync(p, 'utf8');
const home = read('src/CampfireHome.tsx');
const main = read('electron/main.mjs');
const preload = read('electron/preload.cjs');
const desktop = read('src/desktop.ts');
const settings = read('src/CampfireSettingsModal.tsx');
const micHookSource = read('src/useCampfireMicrophoneTest.ts');

function wavDurationSeconds(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 8 + 8);
    if (id === 'data') { dataSize = size; break; }
    offset += 8 + size + (size % 2);
  }
  assert.ok(byteRate > 0 && dataSize > 0, 'valid PCM WAV header');
  return dataSize / byteRate;
}

test('Conversa, Animes e Tela open real detached desktop windows with web fallback', () => {
  assert.match(home, /openCampfireWorkspaceWindow/);
  assert.match(home, /kind:\s*"messages"/);
  assert.match(home, /kind:\s*"anime"/);
  assert.match(home, /kind:\s*"screen"/);
  assert.match(desktop, /workspace:\s*\{/);
  assert.match(desktop, /open:\s*\(payload/);
  assert.match(preload, /workspace:open/);
  assert.match(main, /ipcMain\.handle\(['"]workspace:open['"]/);
});

test('detached windows are movable resizable and have minimize maximize and close chrome', () => {
  assert.match(main, /resizable:\s*true/);
  assert.match(main, /movable:\s*true/);
  assert.match(main, /minimizable:\s*true/);
  assert.match(main, /maximizable:\s*true/);
  assert.match(main, /closable:\s*true/);
  assert.match(main, /workspaceOriginalBounds/);
});

test('Escape restores a resized or maximized detached window, then closes it at original size', () => {
  assert.match(main, /before-input-event/);
  assert.match(main, /input\.key\s*!==\s*['"]Escape['"]/);
  assert.match(main, /isMaximized\(\)/);
  assert.match(main, /restoreWorkspaceWindowToOriginalSize/);
  assert.match(main, /workspaceWindow\.close\(\)/);
  assert.match(main, /focusMainWindow/);
});

test('Anime native surface belongs to the BrowserWindow that requested it', () => {
  assert.match(main, /BrowserWindow\.fromWebContents\(/);
  assert.match(main, /ownerWindow/);
  assert.match(main, /ownerWindow\.contentView\.addChildView/);
});

test('Escape walks back nested app menus before closing the root menu', () => {
  assert.match(home, /handleCampfireMenuEscape/);
  assert.match(home, /activeAppMenu/);
  assert.match(home, /showUnifiedMenu/);
  assert.match(home, /setActiveAppMenu\(null\)/);
  assert.match(home, /setShowUnifiedMenu\(false\)/);
});

test('microphone test has live monitor and record/replay modes with a 15 second hard limit', () => {
  assert.match(settings, /Monitorar ao vivo/);
  assert.match(settings, /Gravar e reproduzir/);
  assert.match(settings, /MAX_MIC_RECORDING_MS\s*=\s*15_?000/);
  assert.match(settings, /MediaRecorder/);
  assert.match(settings, /Iniciar gravação/);
  assert.match(settings, /Parar gravação/);
  assert.match(settings, /Reproduzir teste/);
  assert.match(settings, /microphoneTest\.processedStream/);
});

test('microphone recording remains local and uses the processed Voice Pro stream', () => {
  assert.match(settings, /processedStream/);
  assert.doesNotMatch(settings, /requestCampfireMediaToken/);
  assert.doesNotMatch(settings, /localParticipant\.publishTrack/);
});

test('app sounds setting gates a two-second fire extinguish sound during quit', () => {
  assert.match(settings, /Sons do app/);
  assert.match(desktop, /onFireOutStart/);
  assert.match(desktop, /onFireOutStop/);
  assert.match(desktop, /notificationSound/);
  assert.match(main, /FIRE_OUT_DURATION_MS\s*=\s*2000/);
  assert.match(main, /campfire:fire-out-start/);
  assert.match(main, /await delay\(FIRE_OUT_DURATION_MS\)/);
  assert.ok(fs.existsSync('public/audio/campfire-fire-out.wav'));
  assert.ok(Math.abs(wavDurationSeconds('public/audio/campfire-fire-out.wav') - 2) < 0.001);
});

test("microphone test rebuilds the local Voice Pro pipeline when input or processing quality changes", () => {
  assert.match(micHookSource, /settingsSignature/);
  assert.match(micHookSource, /settings\.audioInputId/);
  assert.match(micHookSource, /settings\.voiceProfile/);
  assert.match(micHookSource, /settings\.echoCancellation/);
  assert.match(micHookSource, /settings\.nativeNoiseSuppression/);
  assert.match(micHookSource, /settings\.autoGainControl/);
  assert.match(micHookSource, /settings\.gateMode/);
  assert.match(micHookSource, /pipelineRef\.current.*void start\(\)/s);
});
