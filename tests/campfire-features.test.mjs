import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('chat keeps realtime, audio messages and readable default text size',()=>{
  const hook=read('src/useCampfireChat.ts');
  assert.match(hook,/message_type/);
  assert.match(hook,/audio/);
  assert.match(hook,/supabase/);
  assert.match(hook,/fontSize:\s*14/);
});

test('voice retains microphone, webcam, deafen and per-user volume controls on LiveKit SFU',()=>{
  const selector=read('src/useCampfireVoice.ts');
  const voice=read('src/useCampfireLiveKitVoice.ts');
  assert.match(selector,/legacy-p2p/);
  assert.match(voice,/getUserMedia/);
  assert.match(voice,/cameraEnabled/);
  assert.match(voice,/deafened/);
  assert.match(voice,/userVolumes/);
  assert.match(voice,/new Room/);
  assert.doesNotMatch(voice,/new RTCPeerConnection/);
});

test('screen sharing requests the Electron picker preference before capture',()=>{
  const screen=read('src/CampfireScreenShare.tsx');
  assert.match(screen,/setDisplayCapturePreference/);
  assert.match(screen,/getDisplayMedia/);
  const main=read('electron/main.mjs');
  assert.match(main,/desktopCapturer\.getSources/);
  assert.match(main,/loopback/);
});

test('anime Watch Together prepares direct frame capture before getDisplayMedia',()=>{
  const anime=read('src/AnimeBrowser.tsx');
  const prepare=anime.indexOf('prepareAnimeWatchCapture');
  const display=anime.indexOf('.getDisplayMedia({');
  assert.ok(prepare>=0 && display>prepare);
  assert.match(anime,/stopAnimeWatchCapture/);
});

test('media cleanup remains present and legacy P2P cleanup stays isolated behind fallback',()=>{
  assert.match(read('src/useCampfireLiveKitVoice.ts'),/disconnect\(\)/);
  assert.match(read('src/useCampfireLiveKitBroadcast.ts'),/disconnect\(\)/);
  assert.match(read('src/useCampfireVoiceLegacy.ts'),/peer\.close\(\)/);
  assert.match(read('src/useCampfireWebRTCLegacy.ts'),/closeHostPeers/);
  assert.match(read('src/useCampfireWebRTCLegacy.ts'),/closeViewerPeer/);
});

test('anime Watch Together releases direct frame capture on every startup failure', () => {
  const anime = read('src/AnimeBrowser.tsx');
  const noVideoStart = anime.indexOf('if (!videoTrack)');
  const noVideoEnd = anime.indexOf('/*\n       * A fonte já foi escolhida', noVideoStart);
  const noVideo = anime.slice(noVideoStart, noVideoEnd);
  assert.match(noVideo, /stopAnimeWatchCapture/);

  const hostingStart = anime.indexOf('const result =\n        await rtc\n          .startHosting', noVideoEnd);
  const hostingEnd = anime.indexOf('setStatusText(', hostingStart);
  const hostFailure = anime.slice(hostingStart, hostingEnd);
  assert.match(hostFailure, /stopAnimeWatchCapture/);
});
