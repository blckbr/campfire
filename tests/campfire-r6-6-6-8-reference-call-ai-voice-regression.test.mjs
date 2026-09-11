import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'src');
const home = fs.readFileSync(path.join(src, 'CampfireHome.tsx'), 'utf8');
const shellCss = fs.readFileSync(path.join(src, 'CampfireR6Shell.css'), 'utf8');

test('R6.6.6.8 removes IA example suggestions and keeps free-search wording only', () => {
  assert.match(home, /Pesquise o que quiser com nossa IA\./);
  assert.doesNotMatch(home, /Exemplo: “Qual é a previsão do tempo para Salvador - Bahia\?/);
  assert.match(home, /placeholder="Pesquise o que quiser com nossa IA"/);
});

test('R6.6.6.8 visual fallback is preserved by the resilient news image component', () => {
  assert.match(home, /function resolveNewsFallbackUrl\(index: number\)/);
  assert.match(home, /<CampfireNewsImage/);
  assert.match(home, /fallbackUrl=\{resolveNewsFallbackUrl\(0\)\}/);
  assert.match(home, /fallbackUrl=\{resolveNewsFallbackUrl\(index \+ 1\)\}/);
});

test('R6.6.6.8 rebuilds the active room controls closer to the approved reference', () => {
  assert.match(home, /className="campfireRoomModeButtons"/);
  assert.match(home, /<span>Conversa<\/span>/);
  assert.match(home, /<span>Animes?<\/span>/);
  assert.match(home, /<span>Tela<\/span>/);
  assert.match(home, /<strong>Microfone<\/strong>/);
  assert.match(home, /<strong>Câmera<\/strong>/);
  assert.match(home, /<strong>Abafar<\/strong>/);
  assert.match(home, /<strong>Volume<\/strong>/);
  assert.match(home, /<strong>Configurações<\/strong>/);
  assert.match(home, /<strong>Controle avançado de voz<\/strong>/);
});

test('R6.6.6.8 action feedback is transient and the large dock styling exists', () => {
  assert.match(shellCss, /\.campfireRoomActionDock\{/);
  assert.match(shellCss, /\.campfireRoomActionFeedback\{/);
  assert.match(shellCss, /@keyframes campfireActionToast/);
  assert.match(shellCss, /\.campfireVoiceMixerPanel\{/);
  assert.match(shellCss, /\.campfireRoomModeButton\{/);
});

test('R6.6.6.8 prioritizes the local camera on the spotlight so webcam activation is visible', () => {
  assert.match(home, /stageMembers\.find\(\(member\) => member\.id === currentUserId && voice\.cameraEnabled\)/);
  assert.match(home, /voice\.localCameraStream/);
});
