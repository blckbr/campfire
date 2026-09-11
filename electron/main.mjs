import {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  session,
  shell,
  screen,
  Tray,
} from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIME_ALLOWED_HOSTS,
  animeCosmeticCss,
  isBlockedAnimeRequest,
  shouldLoadPopupInAnimeView,
} from './lib/anime-content-blocker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DEV_URL = process.env.CAMPFIRE_DEV_URL || '';
const APP_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'campfire-icon.png')
  : path.join(ROOT, 'public', 'campfire-icon.png');
const OAUTH_PORT = 54321;
const ANIME_PARTITION = 'persist:campfire-anime';
const ALLOWED_ANIME_HOSTS = new Set(ANIME_ALLOWED_HOSTS);
const configuredAnimeSessions = new WeakSet();

const SUPPORTED_UI_LANGUAGES = new Set(['system', 'pt-BR', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT']);
const SUPPORTED_CLOSE_BEHAVIORS = new Set(['ask', 'quit', 'tray', 'logout']);
const DEFAULT_DESKTOP_PREFERENCES = Object.freeze({
  uiScale: 1,
  language: 'system',
  closeBehavior: 'ask',
  windowBounds: null,
  maximized: false,
});

let desktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES };
let tray = null;
let isQuitting = false;
let windowStateTimer = null;
const closePromptHiddenAnimeLabels = new Set();

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let splashWindow = null;
let oauthServer = null;
let activeAnimeLabel = null;
let activeCaptureFrame = null;
let activeCaptureLabel = null;
let animePlayerFullscreen = null;
let capturePreference = 'all';
const animeViews = new Map();
const workspaceWindows = new Map();
const WORKSPACE_KINDS = new Set(['messages', 'anime', 'screen']);
const FIRE_OUT_DURATION_MS = 2000;
let pendingQuitGeneration = 0;
let quitPending = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function workspaceOriginalBounds(kind) {
  const size = kind === 'anime'
    ? { width: 1200, height: 800 }
    : kind === 'screen'
      ? { width: 1100, height: 760 }
      : { width: 980, height: 760 };
  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    width: Math.min(size.width, area.width),
    height: Math.min(size.height, area.height),
    x: Math.round(area.x + Math.max(0, (area.width - Math.min(size.width, area.width)) / 2)),
    y: Math.round(area.y + Math.max(0, (area.height - Math.min(size.height, area.height)) / 2)),
  };
}

function restoreWorkspaceWindowToOriginalSize(workspaceWindow, originalBounds) {
  if (!workspaceWindow || workspaceWindow.isDestroyed()) return false;
  if (workspaceWindow.isFullScreen()) workspaceWindow.setFullScreen(false);
  if (workspaceWindow.isMaximized()) workspaceWindow.unmaximize();
  const current = workspaceWindow.getBounds();
  workspaceWindow.setBounds({
    x: current.x,
    y: current.y,
    width: originalBounds.width,
    height: originalBounds.height,
  }, true);
  return true;
}

function removeAnimeViewsForOwner(ownerWindow) {
  for (const [label, rec] of [...animeViews.entries()]) {
    if (rec?.ownerWindow === ownerWindow) removeAnime(label);
  }
}

async function openWorkspaceWindow(payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const kind = String(payload.kind || '');
  const campfireId = String(payload.campfireId || '').trim();
  if (!WORKSPACE_KINDS.has(kind) || !campfireId) return false;

  const key = `${campfireId}:${kind}`;
  const existing = workspaceWindows.get(key);
  if (existing?.window && !existing.window.isDestroyed()) {
    if (existing.window.isMinimized()) existing.window.restore();
    existing.window.show();
    existing.window.focus();
    return true;
  }

  const originalBounds = workspaceOriginalBounds(kind);
  const labels = { messages: 'Conversa', anime: 'Animes', screen: 'Tela' };
  const workspaceWindow = new BrowserWindow({
    ...originalBounds,
    minWidth: 520,
    minHeight: 390,
    show: false,
    title: `Campfire — ${labels[kind]}`,
    frame: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    backgroundColor: '#090a0d',
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  workspaceWindows.set(key, { window: workspaceWindow, kind, campfireId, originalBounds });
  workspaceWindow.setMenu(null);
  workspaceWindow.setMenuBarVisibility(false);
  workspaceWindow.webContents.setZoomFactor(clampUiScale(desktopPreferences.uiScale));
  configurePermissions(workspaceWindow.webContents.session);
  installEditableTextContextMenu(workspaceWindow);

  workspaceWindow.webContents.on('before-input-event', (event, input) => {
    if (input?.type !== 'keyDown' || input.key !== 'Escape') return;
    event.preventDefault();
    const current = workspaceWindow.getBounds();
    const changedSize = current.width !== originalBounds.width || current.height !== originalBounds.height;
    if (workspaceWindow.isMaximized() || workspaceWindow.isFullScreen() || changedSize) {
      restoreWorkspaceWindowToOriginalSize(workspaceWindow, originalBounds);
      return;
    }
    workspaceWindow.close();
  });

  workspaceWindow.on('closed', () => {
    workspaceWindows.delete(key);
    removeAnimeViewsForOwner(workspaceWindow);
    focusMainWindow();
  });

  workspaceWindow.once('ready-to-show', () => {
    workspaceWindow.show();
    workspaceWindow.focus();
  });

  if (DEV_URL) {
    const target = new URL(DEV_URL);
    target.searchParams.set('campfirePopout', kind);
    target.searchParams.set('campfireId', campfireId);
    await workspaceWindow.loadURL(target.toString());
  } else {
    await workspaceWindow.loadFile(path.join(DIST, 'index.html'), {
      query: { campfirePopout: kind, campfireId },
    });
  }
  return true;
}

function normalizeAnimeUrl(raw) {
  const u = new URL(String(raw || ''));
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('A fonte precisa usar HTTP ou HTTPS.');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = [...ALLOWED_ANIME_HOSTS].some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!allowed) throw new Error('Esta URL não pertence a uma fonte de anime permitida pelo Campfire.');
  return u.toString();
}

function configurePermissions(ses) {
  const allowed = new Set(['media', 'display-capture', 'fullscreen']);
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
}

function configureAnimeSession(ses) {
  if (configuredAnimeSessions.has(ses)) return;
  configuredAnimeSessions.add(ses);

  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const cancel = isBlockedAnimeRequest(details.url);
      if (cancel) console.info('[Anime adblock] request bloqueada:', details.url);
      callback({ cancel });
    },
  );
}

function makePickerHtml() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;background:#0b0d11;color:#eef1f4;font:14px Segoe UI,Arial,sans-serif;overflow:hidden}.wrap{height:100vh;display:grid;grid-template-rows:auto 1fr auto}.head{padding:16px 18px;border-bottom:1px solid #2b3038;background:linear-gradient(#1d2128,#101318)}h2{font-size:17px;margin:0 0 5px}p{margin:0;color:#9ca7b2;font-size:12px}.grid{overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.source{border:1px solid #333a44;border-radius:10px;background:linear-gradient(#1a1e24,#111419);padding:8px;color:#e9edf0;text-align:left;cursor:pointer}.source:hover{border-color:#c57a38;background:linear-gradient(#252a32,#161a20)}.source img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:6px;display:block}.name{display:block;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.foot{padding:10px 14px;border-top:1px solid #2b3038;display:flex;justify-content:flex-end;background:#101318}.cancel{height:34px;padding:0 14px;border:1px solid #454c57;border-radius:7px;background:#1b2027;color:#dce1e6;cursor:pointer}</style></head><body><div class="wrap"><div class="head"><h2>Escolha o que transmitir</h2><p>O Campfire só captura a tela ou janela que você selecionar.</p></div><div id="grid" class="grid"></div><div class="foot"><button id="cancel" class="cancel">Cancelar</button></div></div><script>
  const grid=document.getElementById('grid');document.getElementById('cancel').onclick=()=>window.campfirePicker.cancel();
  window.campfirePicker.onSources((sources)=>{grid.textContent='';for(const s of sources){const b=document.createElement('button');b.className='source';const img=document.createElement('img');img.src=s.thumbnail;const n=document.createElement('span');n.className='name';n.textContent=s.name;b.append(img,n);b.onclick=()=>window.campfirePicker.select(s.id);grid.appendChild(b);}});
  window.addEventListener('keydown',(e)=>{if(e.key==='Escape')window.campfirePicker.cancel();});
  </script></body></html>`;
}

async function chooseDesktopSource() {
  const types = capturePreference === 'window' ? ['window'] : capturePreference === 'monitor' ? ['screen'] : ['screen', 'window'];
  const sources = await desktopCapturer.getSources({ types, thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true });
  if (!sources.length) return null;
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  return await new Promise((resolve) => {
    const picker = new BrowserWindow({
      width: 760, height: 620, minWidth: 620, minHeight: 460,
      parent: mainWindow, modal: true, show: false, title: 'Campfire — Compartilhar',
      backgroundColor: '#0b0d11', autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'screen-picker-preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
      },
    });
    let settled = false;
    const finish = (source) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('picker:select', onSelect);
      ipcMain.removeListener('picker:cancel', onCancel);
      if (!picker.isDestroyed()) picker.destroy();
      resolve(source || null);
    };
    const onSelect = (_event, id) => finish(sources.find((s) => s.id === id));
    const onCancel = () => finish(null);
    ipcMain.once('picker:select', onSelect);
    ipcMain.once('picker:cancel', onCancel);
    picker.on('closed', () => finish(null));
    picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(makePickerHtml())}`).then(() => {
      picker.webContents.send('picker:sources', sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })));
      picker.show();
    }).catch(() => finish(null));
  });
}

function configureDisplayCapture(ses) {
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const frame = activeCaptureFrame;
      if (frame && !frame.detached) {
        callback({
          video: frame,
          audio: request.audioRequested ? frame : undefined,
          enableLocalEcho: true,
        });
        return;
      }
      const source = await chooseDesktopSource();
      if (!source) return callback({});
      callback({
        video: source,
        audio: request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined,
      });
    } catch (error) {
      console.error('[Campfire display capture]', error);
      callback({});
    }
  });
}

async function probeMediaFrame(frame) {
  if (!frame || frame.detached) return null;
  try {
    const info = await frame.executeJavaScript(`(() => {
      let best=null;for(const video of document.querySelectorAll('video')){const r=video.getBoundingClientRect();const area=Math.max(0,r.width)*Math.max(0,r.height);const playing=!video.paused&&!video.ended&&video.readyState>=2;const visible=r.width>=120&&r.height>=80;const score=area+(playing?1e9:0)+(visible?1e8:0)+(video.readyState>=3?1e7:0);if(!best||score>best.score)best={score,area,playing,readyState:video.readyState,width:r.width,height:r.height};}return {hasVideo:!!best,video:best,url:location.href,title:document.title};})()`, false);
    return { frame, info };
  } catch { return null; }
}

async function findBestMediaFrame(view) {
  const frames = view.webContents.mainFrame.framesInSubtree;
  const results = await Promise.all(frames.map(probeMediaFrame));
  const candidates = results.filter(Boolean).filter((item) => item.info?.hasVideo);
  candidates.sort((a,b) => Number(b.info?.video?.score || 0) - Number(a.info?.video?.score || 0));
  return candidates[0] || { frame: view.webContents.mainFrame, info: { hasVideo: false, url: view.webContents.getURL() } };
}

async function isolateAnimePlayer(frame) {
  if (!frame || frame.detached) return { ok: false, message: 'Frame de vídeo indisponível.' };
  try {
    return await frame.executeJavaScript(`(() => {
      if (window.__campfirePlayerIsolation?.active) return { ok: true, reused: true };
      const videos = [...document.querySelectorAll('video')];
      let best = null;
      for (const video of videos) {
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        const score = area + (!video.paused && !video.ended ? 1e9 : 0) + (video.readyState >= 2 ? 1e8 : 0);
        if (!best || score > best.score) best = { video, score };
      }
      const video = best?.video;
      if (!video || !document.body || !document.documentElement) return { ok: false, message: 'Player HTML5 não encontrado.' };

      const state = {
        active: true,
        video,
        parent: video.parentNode,
        nextSibling: video.nextSibling,
        videoStyle: video.getAttribute('style'),
        htmlStyle: document.documentElement.getAttribute('style'),
        bodyStyle: document.body.getAttribute('style'),
        children: [...document.body.children].map((node) => [node, node.getAttribute('style')]),
      };
      window.__campfirePlayerIsolation = state;

      document.documentElement.style.cssText += ';background:#000!important;overflow:hidden!important;';
      document.body.style.cssText += ';margin:0!important;background:#000!important;overflow:hidden!important;width:100vw!important;height:100vh!important;';
      document.body.appendChild(video);
      for (const child of [...document.body.children]) {
        if (child !== video) child.style.setProperty('display', 'none', 'important');
      }
      video.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;object-fit:contain!important;background:#000!important;z-index:2147483647!important;display:block!important;margin:0!important;';
      return { ok: true, width: video.videoWidth || 0, height: video.videoHeight || 0 };
    })()`, false);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function restoreAnimePlayer(frame) {
  if (!frame || frame.detached) return false;
  try {
    return await frame.executeJavaScript(`(() => {
      const state = window.__campfirePlayerIsolation;
      if (!state?.active) return true;
      const restoreAttr = (node, value) => {
        if (!node) return;
        if (value == null) node.removeAttribute('style'); else node.setAttribute('style', value);
      };
      try {
        if (state.parent?.isConnected) state.parent.insertBefore(state.video, state.nextSibling?.parentNode === state.parent ? state.nextSibling : null);
      } catch {}
      restoreAttr(state.video, state.videoStyle);
      for (const [node, style] of state.children || []) restoreAttr(node, style);
      restoreAttr(document.documentElement, state.htmlStyle);
      restoreAttr(document.body, state.bodyStyle);
      delete window.__campfirePlayerIsolation;
      return true;
    })()`, false);
  } catch {
    return false;
  }
}

async function setAnimePlayerFullscreen(label, enabled) {
  const rec = getAnime(label);
  const ownerWindow = rec?.ownerWindow;
  if (!rec || !ownerWindow || ownerWindow.isDestroyed()) return false;

  if (enabled) {
    const selected = await findBestMediaFrame(rec.view);
    if (!selected?.info?.hasVideo) throw new Error('Não encontrei o player para abrir em tela cheia.');
    const isolated = await isolateAnimePlayer(selected.frame);
    if (!isolated?.ok) throw new Error(isolated?.message || 'Não foi possível isolar o player.');

    animePlayerFullscreen = { label: String(label), frame: selected.frame };
    ownerWindow.setFullScreen(true);
    const [width, height] = ownerWindow.getContentSize();
    rec.view.setBounds({ x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) });
    rec.view.setVisible(true);
    rec.view.webContents.focus();
    ownerWindow.webContents.send('anime:player-fullscreen-changed', { label: String(label), enabled: true });
    return true;
  }

  const active = animePlayerFullscreen;
  if (active?.frame) await restoreAnimePlayer(active.frame);
  animePlayerFullscreen = null;
  ownerWindow.setFullScreen(false);
  if (rec.bounds) rec.view.setBounds(rec.bounds);
  ownerWindow.webContents.send('anime:player-fullscreen-changed', { label: String(label), enabled: false });
  return true;
}

function getAnime(label) {
  const rec = animeViews.get(String(label || ''));
  if (!rec || rec.view.webContents.isDestroyed()) return null;
  return rec;
}

function removeAnime(label) {
  const rec = getAnime(label);
  if (!rec) return false;
  try { rec.ownerWindow?.contentView.removeChildView(rec.view); } catch {}
  try { rec.view.webContents.close(); } catch {}
  animeViews.delete(label);
  if (activeAnimeLabel === label) activeAnimeLabel = null;
  if (activeCaptureLabel === label && activeCaptureFrame) void restoreAnimePlayer(activeCaptureFrame);
  if (animePlayerFullscreen?.label === label && animePlayerFullscreen.frame) void restoreAnimePlayer(animePlayerFullscreen.frame);
  activeCaptureFrame = null;
  activeCaptureLabel = null;
  if (animePlayerFullscreen?.label === label) animePlayerFullscreen = null;
  return true;
}

function safeBounds(value) {
  const b = value || {};
  return {
    x: Math.max(0, Math.round(Number(b.x) || 0)),
    y: Math.max(0, Math.round(Number(b.y) || 0)),
    width: Math.max(1, Math.round(Number(b.width) || 1)),
    height: Math.max(1, Math.round(Number(b.height) || 1)),
  };
}


function clampUiScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1.5, Math.max(0.8, Math.round(number * 20) / 20));
}

function normalizeSupportedLocale(raw) {
  const locale = String(raw || '').toLowerCase();
  if (locale.startsWith('pt')) return 'pt-BR';
  if (locale.startsWith('es')) return 'es-ES';
  if (locale.startsWith('fr')) return 'fr-FR';
  if (locale.startsWith('de')) return 'de-DE';
  if (locale.startsWith('it')) return 'it-IT';
  return 'en-US';
}

function effectiveUiLanguage() {
  return desktopPreferences.language === 'system'
    ? normalizeSupportedLocale(app.getLocale())
    : normalizeSupportedLocale(desktopPreferences.language);
}

function desktopPreferencesPath() {
  return path.join(app.getPath('userData'), 'campfire-desktop-preferences.json');
}

function loadDesktopPreferences() {
  try {
    const raw = JSON.parse(fs.readFileSync(desktopPreferencesPath(), 'utf8'));
    desktopPreferences = {
      ...DEFAULT_DESKTOP_PREFERENCES,
      ...raw,
      uiScale: clampUiScale(raw?.uiScale),
      language: SUPPORTED_UI_LANGUAGES.has(raw?.language) ? raw.language : 'system',
      closeBehavior: SUPPORTED_CLOSE_BEHAVIORS.has(raw?.closeBehavior) ? raw.closeBehavior : 'ask',
      windowBounds: raw?.windowBounds && typeof raw.windowBounds === 'object' ? raw.windowBounds : null,
      maximized: Boolean(raw?.maximized),
    };
  } catch {
    desktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES };
  }
}

function saveDesktopPreferences() {
  try {
    fs.mkdirSync(path.dirname(desktopPreferencesPath()), { recursive: true });
    fs.writeFileSync(
      desktopPreferencesPath(),
      JSON.stringify(desktopPreferences, null, 2),
      'utf8',
    );
  } catch (error) {
    console.warn('[Desktop preferences]', error);
  }
}

function publicDesktopPreferences() {
  const systemLocale = normalizeSupportedLocale(app.getLocale());
  return {
    uiScale: clampUiScale(desktopPreferences.uiScale),
    language: desktopPreferences.language,
    closeBehavior: desktopPreferences.closeBehavior,
    systemLocale,
    effectiveLanguage: effectiveUiLanguage(),
    appVersion: app.getVersion(),
  };
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const locale = effectiveUiLanguage();
  const labels = {
    'pt-BR': { open: 'Abrir Campfire', quit: 'Apagar a fogueira e sair' },
    'en-US': { open: 'Open Campfire', quit: 'Put out the fire and quit' },
    'es-ES': { open: 'Abrir Campfire', quit: 'Apagar la fogata y salir' },
    'fr-FR': { open: 'Ouvrir Campfire', quit: 'Éteindre le feu et quitter' },
    'de-DE': { open: 'Campfire öffnen', quit: 'Feuer löschen und beenden' },
    'it-IT': { open: 'Apri Campfire', quit: 'Spegni il fuoco ed esci' },
  }[locale];

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: labels.open, click: () => restoreMainWindow() },
    { type: 'separator' },
    {
      label: labels.quit,
      click: () => {
        void performCloseAction('quit');
      },
    },
  ]));
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) {
    updateTrayMenu();
    return tray;
  }
  if (!fs.existsSync(APP_ICON)) return null;
  tray = new Tray(APP_ICON);
  tray.setToolTip('Campfire — a fogueira continua acesa.');
  tray.on('double-click', () => restoreMainWindow());
  tray.on('click', () => restoreMainWindow());
  updateTrayMenu();
  return tray;
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function captureWindowStateNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  desktopPreferences.maximized = mainWindow.isMaximized();
  if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
    desktopPreferences.windowBounds = mainWindow.getBounds();
  }
  saveDesktopPreferences();
}

function scheduleWindowStateSave() {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    captureWindowStateNow();
  }, 180);
}

function initialWindowBounds() {
  const saved = desktopPreferences.windowBounds;
  const fallback = { width: 1320, height: 840 };
  if (!saved || typeof saved !== 'object') return fallback;

  const width = Math.max(760, Math.round(Number(saved.width) || fallback.width));
  const height = Math.max(520, Math.round(Number(saved.height) || fallback.height));
  const x = Number(saved.x);
  const y = Number(saved.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return { width, height };

  const candidate = { x: Math.round(x), y: Math.round(y), width, height };
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      candidate.x < area.x + area.width - 80 &&
      candidate.x + candidate.width > area.x + 80 &&
      candidate.y < area.y + area.height - 60 &&
      candidate.y + candidate.height > area.y + 60
    );
  });

  return visible ? candidate : { width, height };
}

function notifyDesktopPreferencesChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('campfire:preferences-changed', publicDesktopPreferences());
}

function applyDesktopPreferencesPatch(patch = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, 'uiScale')) {
    desktopPreferences.uiScale = clampUiScale(patch.uiScale);
    mainWindow?.webContents.setZoomFactor(desktopPreferences.uiScale);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
    desktopPreferences.language = SUPPORTED_UI_LANGUAGES.has(patch.language)
      ? patch.language
      : 'system';
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'closeBehavior')) {
    desktopPreferences.closeBehavior = SUPPORTED_CLOSE_BEHAVIORS.has(patch.closeBehavior)
      ? patch.closeBehavior
      : 'ask';
  }

  saveDesktopPreferences();
  updateTrayMenu();
  notifyDesktopPreferencesChanged();
  return publicDesktopPreferences();
}


function hideAnimeViewsForClosePrompt() {
  closePromptHiddenAnimeLabels.clear();
  for (const [label, rec] of animeViews.entries()) {
    if (!rec?.visible) continue;
    try {
      rec.view.setVisible(false);
      closePromptHiddenAnimeLabels.add(label);
    } catch {}
  }
}

function restoreAnimeViewsAfterClosePrompt() {
  for (const label of closePromptHiddenAnimeLabels) {
    const rec = animeViews.get(label);
    if (!rec?.visible) continue;
    try { rec.view.setVisible(true); } catch {}
  }
  closePromptHiddenAnimeLabels.clear();
}

async function performCloseAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return true;

  if (action === 'tray') {
    restoreAnimeViewsAfterClosePrompt();
    const activeTray = ensureTray();
    if (!activeTray) {
      restoreMainWindow();
      return false;
    }
    mainWindow.hide();
    return true;
  }

  if (action === 'logout') {
    restoreAnimeViewsAfterClosePrompt();
    desktopPreferences.closeBehavior = 'ask';
    saveDesktopPreferences();
    notifyDesktopPreferencesChanged();
    restoreMainWindow();
    mainWindow.webContents.send('campfire:logout-request');
    return true;
  }

  if (action === 'quit') {
    if (quitPending) return true;
    quitPending = true;
    const generation = ++pendingQuitGeneration;
    mainWindow.webContents.send('campfire:fire-out-start', { durationMs: FIRE_OUT_DURATION_MS });
    await delay(FIRE_OUT_DURATION_MS);
    if (generation !== pendingQuitGeneration) {
      quitPending = false;
      return false;
    }
    isQuitting = true;
    app.quit();
    return true;
  }

  return false;
}


const CAMPFIRE_NETWORK_TIMEOUT_MS = 9000;

function decodeEntities(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripMarkup(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchCampfireUrl(url, options = {}, timeoutMs = CAMPFIRE_NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Campfire/1.0 (+desktop-news-assistant)',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function xmlTag(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block).match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function xmlSource(block) {
  const match = String(block).match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
  return match ? stripMarkup(match[1]) : 'Google News';
}

function imageFromHtml(html = '') {
  const source = String(html);
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]?.startsWith('http')) return decodeEntities(match[1]);
  }
  return '';
}

function parseGoogleNewsRss(xml) {
  const itemBlocks = String(xml).match(/<item>[\s\S]*?<\/item>/gi) || [];
  return itemBlocks.slice(0, 18).map((block, index) => {
    const rawDescription = xmlTag(block, 'description');
    return {
      id: `news-${index}-${xmlTag(block, 'title').slice(0, 60)}`,
      title: stripMarkup(xmlTag(block, 'title')) || 'Notícia',
      summary: stripMarkup(rawDescription).slice(0, 360) || 'Clique para abrir a cobertura completa.',
      source: xmlSource(block),
      url: stripMarkup(xmlTag(block, 'link')) || 'https://news.google.com/home?hl=pt-BR&gl=BR&ceid=BR:pt-419',
      publishedAt: stripMarkup(xmlTag(block, 'pubDate')) || new Date().toISOString(),
      imageUrl: imageFromHtml(rawDescription) || '',
    };
  });
}

async function enrichNewsImages(items) {
  return await Promise.all(items.map(async (item, index) => {
    if (item.imageUrl || index > 7) return item;
    try {
      const response = await fetchCampfireUrl(item.url, { redirect: 'follow' }, 3500);
      if (!response.ok) return item;
      const html = await response.text();
      const imageUrl = imageFromHtml(html);
      return imageUrl ? { ...item, imageUrl } : item;
    } catch {
      return item;
    }
  }));
}

async function getLiveNews(query = '') {
  const trimmed = String(query || '').trim();
  const base = 'https://news.google.com/rss';
  const url = trimmed
    ? `${base}/search?q=${encodeURIComponent(trimmed)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
    : `${base}?hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const response = await fetchCampfireUrl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Google News respondeu HTTP ${response.status}.`);
  const items = parseGoogleNewsRss(await response.text());
  if (!items.length) throw new Error('O feed de notícias não retornou manchetes.');
  return await enrichNewsImages(items);
}

function weatherDescription(code) {
  const c = Number(code);
  if (c === 0) return 'céu limpo';
  if ([1,2].includes(c)) return 'parcialmente nublado';
  if (c === 3) return 'nublado';
  if ([45,48].includes(c)) return 'neblina';
  if ([51,53,55,56,57].includes(c)) return 'garoa';
  if ([61,63,65,66,67,80,81,82].includes(c)) return 'chuva';
  if ([71,73,75,77,85,86].includes(c)) return 'neve';
  if ([95,96,99].includes(c)) return 'trovoadas';
  return 'condições variadas';
}

function looksLikeWeatherQuery(query) {
  return /\b(previs[aã]o|tempo|clima|temperatura|chuva|chover|meteorolog)/i.test(query);
}

function extractWeatherLocation(query) {
  const normalized = String(query).replace(/[?!.]+$/g, '').trim();
  const match = normalized.match(/(?:\bpara\b|\bem\b|\bde\b)\s+(.+)$/i);
  const location = match?.[1]
    ? match[1].trim()
    : normalized
      .replace(/^(?:qual\s+(?:é|e)\s+)?(?:a\s+)?(?:previs[aã]o\s+do\s+tempo|tempo|clima|temperatura)\s*/i, '')
      .trim();
  return location.replace(/\s+-\s+/g, ', ');
}

async function answerWeatherQuery(query) {
  const locationQuery = extractWeatherLocation(query);
  if (!locationQuery) throw new Error('Informe a cidade para consultar a previsão do tempo.');
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=pt&format=json`;
  const geoResponse = await fetchCampfireUrl(geoUrl, { cache: 'no-store' });
  if (!geoResponse.ok) throw new Error(`Geocodificação respondeu HTTP ${geoResponse.status}.`);
  const geo = await geoResponse.json();
  const place = Array.isArray(geo?.results) ? geo.results[0] : null;
  if (!place) throw new Error(`Não encontrei a localização “${locationQuery}”.`);

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(place.latitude));
  forecastUrl.searchParams.set('longitude', String(place.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m');
  forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  forecastUrl.searchParams.set('forecast_days', '3');
  forecastUrl.searchParams.set('timezone', 'auto');
  const weatherResponse = await fetchCampfireUrl(forecastUrl.toString(), { cache: 'no-store' });
  if (!weatherResponse.ok) throw new Error(`Previsão respondeu HTTP ${weatherResponse.status}.`);
  const weather = await weatherResponse.json();
  const current = weather?.current || {};
  const daily = weather?.daily || {};
  const locationName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  const todayChance = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] : null;
  const parts = [
    `Agora em ${locationName}: ${Math.round(Number(current.temperature_2m))} °C, sensação de ${Math.round(Number(current.apparent_temperature))} °C, ${weatherDescription(current.weather_code)}.`,
    `Umidade ${Math.round(Number(current.relative_humidity_2m))}% e vento de ${Math.round(Number(current.wind_speed_10m))} km/h.`,
  ];
  if (Number.isFinite(Number(todayChance))) parts.push(`A chance máxima de precipitação hoje é de ${Math.round(Number(todayChance))}%.`);
  if (Array.isArray(daily.time)) {
    const next = daily.time.slice(0, 3).map((dateValue, index) => {
      const label = new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' });
      const min = Math.round(Number(daily.temperature_2m_min?.[index]));
      const max = Math.round(Number(daily.temperature_2m_max?.[index]));
      const chance = Math.round(Number(daily.precipitation_probability_max?.[index] ?? 0));
      return `${label}: ${min}–${max} °C, ${weatherDescription(daily.weather_code?.[index])}, chuva até ${chance}%`;
    });
    if (next.length) parts.push(`Próximos dias: ${next.join(' • ')}.`);
  }
  return {
    answer: parts.join(' '),
    sources: [
      { label: 'Open-Meteo Forecast', url: forecastUrl.toString() },
      { label: 'Open-Meteo Geocoding', url: geoUrl },
    ],
  };
}

function flattenDuckTopics(topics, output = []) {
  for (const topic of Array.isArray(topics) ? topics : []) {
    if (topic?.Text && topic?.FirstURL) output.push({ text: stripMarkup(topic.Text), url: topic.FirstURL });
    if (Array.isArray(topic?.Topics)) flattenDuckTopics(topic.Topics, output);
    if (output.length >= 5) break;
  }
  return output;
}

async function answerDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`;
  const response = await fetchCampfireUrl(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  const direct = [data?.Answer, data?.AbstractText, data?.Definition].find((value) => typeof value === 'string' && value.trim());
  const related = flattenDuckTopics(data?.RelatedTopics);
  if (!direct && !related.length) return null;
  const chunks = [];
  if (direct) chunks.push(String(direct).trim());
  if (related.length) chunks.push(related.slice(0, 3).map((item) => item.text).join(' '));
  const sources = [];
  if (data?.AbstractURL) sources.push({ label: data.AbstractSource || 'DuckDuckGo', url: data.AbstractURL });
  for (const item of related.slice(0, 3)) sources.push({ label: 'Resultado relacionado', url: item.url });
  return { answer: chunks.join(' '), sources };
}

async function answerWikipedia(query) {
  const searchUrl = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
  const response = await fetchCampfireUrl(searchUrl, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  const result = data?.query?.search?.[0];
  if (!result?.title) return null;
  const summaryUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(result.title.replace(/ /g, '_'))}`;
  const summaryResponse = await fetchCampfireUrl(summaryUrl, { cache: 'no-store' });
  if (!summaryResponse.ok) return null;
  const summary = await summaryResponse.json();
  if (!summary?.extract) return null;
  return {
    answer: summary.extract,
    sources: [{ label: summary.title || result.title, url: summary?.content_urls?.desktop?.page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}` }],
  };
}

function htmlResultText(html) {
  const results = [];
  const blocks = String(html).split(/class=["']result(?:\s|__)/i).slice(1);
  for (const block of blocks) {
    const titleMatch = block.match(/class=["']result__a["'][^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>|class=["']result__snippet["'][^>]*>([\s\S]*?)<\/div>/i);
    const hrefMatch = block.match(/class=["']result__a["'][^>]+href=["']([^"']+)["']/i);
    if (!titleMatch || !hrefMatch) continue;
    const title = stripMarkup(titleMatch[1]);
    const snippet = stripMarkup(snippetMatch?.[1] || snippetMatch?.[2] || '');
    if (!title) continue;
    let resultUrl = decodeEntities(hrefMatch[1]);
    if (resultUrl.startsWith('//')) resultUrl = `https:${resultUrl}`;
    else if (resultUrl.startsWith('/')) resultUrl = `https://duckduckgo.com${resultUrl}`;
    results.push({ title, snippet, url: resultUrl });
    if (results.length >= 5) break;
  }
  return results;
}

async function answerWebSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchCampfireUrl(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const results = htmlResultText(await response.text());
  if (!results.length) return null;
  const answer = results.slice(0, 3).map((item) => `${item.title}: ${item.snippet || 'Abra o resultado para mais detalhes.'}`).join(' ');
  return { answer, sources: results.slice(0, 5).map((item) => ({ label: item.title, url: item.url })) };
}

async function answerNewsQuery(query) {
  const topic = String(query).replace(/\b(not[ií]cias?|novidades?|últimas?|ultimas?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const items = await getLiveNews(topic);
  const selected = items.slice(0, 5);
  return {
    answer: selected.map((item) => `${item.source}: ${item.title}`).join(' • '),
    sources: selected.map((item) => ({ label: item.title, url: item.url })),
  };
}

async function answerCampfireAssistant(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) throw new Error('Digite uma pergunta para a IA do Campfire.');
  if (looksLikeWeatherQuery(query)) return await answerWeatherQuery(query);
  if (/\b(not[ií]cias?|novidades?|últimas?|ultimas?)\b/i.test(query)) return await answerNewsQuery(query);

  for (const resolver of [answerDuckDuckGo, answerWikipedia, answerWebSearch]) {
    try {
      const result = await resolver(query);
      if (result?.answer) return result;
    } catch (error) {
      console.warn('[Campfire AI] fonte indisponível:', error?.message || error);
    }
  }
  return {
    answer: 'Não encontrei uma resposta direta nas fontes públicas agora. Você pode abrir a pesquisa completa pelo link abaixo e tentar novamente em seguida.',
    sources: [{ label: `Pesquisar “${query}”`, url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` }],
  };
}

function registerIpc() {
  ipcMain.handle('shell:open-external', async (_e, raw) => {
    const u = new URL(String(raw || ''));
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Somente links HTTP/HTTPS podem ser abertos.');
    await shell.openExternal(u.toString()); return true;
  });
  ipcMain.handle('campfire:news-feed', async (_event, query = '') => await getLiveNews(query));
  ipcMain.handle('campfire:assistant-query', async (_event, query) => await answerCampfireAssistant(query));
  ipcMain.handle('clipboard:write-text', (_e, raw) => { clipboard.writeText(String(raw ?? '')); return true; });
  ipcMain.handle('window:show', () => { mainWindow?.show(); return true; });
  ipcMain.handle('window:unminimize', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); return true; });
  ipcMain.handle('window:focus', () => { mainWindow?.focus(); return true; });
  ipcMain.handle('window:set-fullscreen', (_e, enabled) => { mainWindow?.setFullScreen(Boolean(enabled)); return true; });
  ipcMain.handle('desktop:get-preferences', () => publicDesktopPreferences());
  ipcMain.handle('desktop:update-preferences', (_event, patch) => applyDesktopPreferencesPatch(patch || {}));
  ipcMain.handle('desktop:close-action', async (_event, payload = {}) => {
    const action = ['quit', 'tray', 'logout', 'cancel'].includes(payload.action)
      ? payload.action
      : 'cancel';
    if (payload.remember && action !== 'cancel') {
      desktopPreferences.closeBehavior = action;
      saveDesktopPreferences();
      notifyDesktopPreferencesChanged();
    }
    if (action === 'cancel') {
      pendingQuitGeneration += 1;
      quitPending = false;
      mainWindow?.webContents.send('campfire:fire-out-stop');
      restoreAnimeViewsAfterClosePrompt();
      return true;
    }
    return await performCloseAction(action);
  });
  ipcMain.handle('workspace:open', async (_event, payload = {}) => await openWorkspaceWindow(payload));
  ipcMain.handle('screen:set-preference', (_e, mode) => { capturePreference = ['monitor','window'].includes(mode) ? mode : 'all'; return true; });

  ipcMain.handle('anime:create', async (_e, payload = {}) => {
    const ownerWindow = BrowserWindow.fromWebContents(_e.sender) || mainWindow;
    if (!ownerWindow || ownerWindow.isDestroyed()) throw new Error('Janela do Anime indisponível.');
    const label = String(payload.label || '').trim(); if (!label) throw new Error('Label da navegação ausente.');
    const url = normalizeAnimeUrl(payload.url);
    removeAnime(label);
    const animeSession = session.fromPartition(ANIME_PARTITION);
    configureAnimeSession(animeSession);
    const view = new WebContentsView({ webPreferences: { partition: ANIME_PARTITION, nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    view.setBounds(safeBounds(payload.bounds));
    view.setBackgroundColor('#ffffff');
    view.webContents.setWindowOpenHandler(({ url: target }) => {
      if (shouldLoadPopupInAnimeView(target)) {
        setImmediate(() => view.webContents.loadURL(target).catch(() => undefined));
      } else {
        console.info('[Anime popup blocker] popup bloqueado:', target);
      }
      return { action: 'deny' };
    });
    view.webContents.on('will-navigate', (event, details) => {
      if (isBlockedAnimeRequest(details?.url)) {
        console.info('[Anime adblock] navegacao bloqueada:', details.url);
        event.preventDefault();
      }
    });
    view.webContents.on('will-redirect', (event, details) => {
      if (isBlockedAnimeRequest(details?.url)) {
        console.info('[Anime adblock] redirecionamento bloqueado:', details.url);
        event.preventDefault();
      }
    });
    view.webContents.on('dom-ready', () => {
      view.webContents.insertCSS(animeCosmeticCss()).catch(() => undefined);
    });
    const initialBounds = safeBounds(payload.bounds);
    animeViews.set(label, { view, ownerWindow, visible: true, bounds: initialBounds });
    view.webContents.on('before-input-event', (event, input) => {
      if (input?.key === 'Escape' && animePlayerFullscreen?.label === label) {
        event.preventDefault();
        void setAnimePlayerFullscreen(label, false).catch((error) => console.warn('[Anime fullscreen exit]', error));
      }
    });
    activeAnimeLabel = label;
    ownerWindow.contentView.addChildView(view);
    view.webContents.loadURL(url).catch((error) => console.warn('[Anime load]', error));
    return { ok: true, label, url };
  });
  ipcMain.handle('anime:close', (_e, label) => removeAnime(String(label || '')));
  ipcMain.handle('anime:hide', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.setVisible(false); rec.visible=false; return true; });
  ipcMain.handle('anime:show', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.setVisible(true); rec.visible=true; activeAnimeLabel=String(label); return true; });
  ipcMain.handle('anime:focus', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.webContents.focus(); activeAnimeLabel=String(label); return true; });
  ipcMain.handle('anime:set-bounds', (_e, label, bounds) => { const rec=getAnime(label); if(!rec)return false; const next=safeBounds(bounds); rec.bounds=next; if (animePlayerFullscreen?.label !== String(label)) rec.view.setBounds(next); return true; });
  ipcMain.handle('anime:get-url', (_e, label) => getAnime(label)?.view.webContents.getURL() || '');
  ipcMain.handle('anime:eval', async (_e, label, script) => { const rec=getAnime(label); if(!rec)throw new Error('Navegador de anime não encontrado.'); return await rec.view.webContents.executeJavaScript(String(script || ''), true); });
  ipcMain.handle('anime:set-player-fullscreen', async (_e, label, enabled) => await setAnimePlayerFullscreen(String(label || ''), Boolean(enabled)));
  ipcMain.handle('watch:prepare-anime-capture', async () => {
    const rec = getAnime(activeAnimeLabel);
    if (!rec) return { ok: false, message: 'Abra o anime dentro do Campfire antes de transmitir.' };
    const selected = await findBestMediaFrame(rec.view);
    if (!selected?.frame || selected.frame.detached || !selected.info?.hasVideo) return { ok: false, message: 'Não encontrei o player de vídeo para transmitir.' };
    const isolated = await isolateAnimePlayer(selected.frame);
    if (!isolated?.ok) return { ok: false, message: isolated?.message || 'Não foi possível isolar o player.' };
    activeCaptureFrame = selected.frame;
    activeCaptureLabel = activeAnimeLabel;
    return { ok: true, hasVideo: true, frameUrl: selected.info?.url || selected.frame.url };
  });
  ipcMain.handle('watch:stop-anime-capture', async () => {
    const frame = activeCaptureFrame;
    activeCaptureFrame = null;
    activeCaptureLabel = null;
    if (frame) await restoreAnimePlayer(frame);
    return true;
  });
}

function startOAuthServer() {
  if (oauthServer) return;
  oauthServer = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_PORT}`);
      if (reqUrl.pathname !== '/auth/callback') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return;
      }
      const full = reqUrl.toString();
      const html = '<!doctype html><meta charset="utf-8"><title>Campfire</title><style>body{font:16px Segoe UI;background:#101318;color:#eee;display:grid;place-items:center;height:100vh;margin:0}.c{padding:28px;border:1px solid #343b45;border-radius:14px;background:#1a1f26;text-align:center}</style><div class="c"><h2>🔥 Campfire</h2><p>Login concluído. Você já pode voltar ao Campfire.</p></div>';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html);
      mainWindow?.webContents.send('campfire-auth-callback', full);
      if (mainWindow) { mainWindow.show(); if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
    } catch { res.writeHead(400); res.end('Bad Request'); }
  });
  oauthServer.on('error', (error) => console.error('[OAuth callback server]', error));
  oauthServer.listen(OAUTH_PORT, '127.0.0.1');
}


function installEditableTextContextMenu(targetWindow = mainWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const wc = targetWindow.webContents;

  wc.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;

    const flags = params.editFlags || {};
    const template = [
      { role: 'undo', label: 'Desfazer', enabled: flags.canUndo !== false },
      { role: 'redo', label: 'Refazer', enabled: flags.canRedo !== false },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar', enabled: flags.canCut !== false },
      { role: 'copy', label: 'Copiar', enabled: flags.canCopy !== false },
      { role: 'paste', label: 'Colar', enabled: flags.canPaste !== false },
      { type: 'separator' },
      { role: 'selectAll', label: 'Selecionar tudo', enabled: flags.canSelectAll !== false },
    ];

    Menu.buildFromTemplate(template).popup({ window: targetWindow });
  });
}

async function createWindows() {
  splashWindow = new BrowserWindow({ width: 560, height: 460, frame: false, transparent: false, resizable: false, show: false, focusable: false, skipTaskbar: true, backgroundColor: '#090a0d', icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });

  const savedBounds = initialWindowBounds();
  mainWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Campfire',
    // R6.6: the real titlebar is drawn by Campfire itself so theme material
    // can reach the bar where the product name is written.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      // R6.6.2: transparent overlay lets the selected raster frame remain
      // visible behind the native minimize/maximize/close controls.
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 34,
    },
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Trusted local Campfire shell: avoid Electron sandbox startupData race on Windows.
      // External Anime views and the screen picker remain sandboxed.
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setZoomFactor(clampUiScale(desktopPreferences.uiScale));
  if (desktopPreferences.maximized) mainWindow.maximize();

  configurePermissions(mainWindow.webContents.session);
  configureDisplayCapture(mainWindow.webContents.session);
  installEditableTextContextMenu();

  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.on('close', (event) => {
    captureWindowStateNow();
    if (isQuitting) return;

    event.preventDefault();
    const action = desktopPreferences.closeBehavior;
    if (action === 'ask') {
      hideAnimeViewsForClosePrompt();
      mainWindow?.webContents.send('campfire:close-request', publicDesktopPreferences());
      return;
    }
    void performCloseAction(action);
  });
  mainWindow.on('closed', () => {
    for (const { window } of workspaceWindows.values()) {
      try { if (!window.isDestroyed()) window.destroy(); } catch {}
    }
    workspaceWindows.clear();
    for (const label of [...animeViews.keys()]) removeAnime(label);
    mainWindow = null;
  });

  let mainRevealed = false;
  const revealMain = () => {
    if (mainRevealed) return;
    mainRevealed = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    splashWindow = null;
  };

  mainWindow.once('ready-to-show', revealMain);

  const mainLoadPromise = DEV_URL
    ? mainWindow.loadURL(DEV_URL)
    : mainWindow.loadFile(path.join(DIST, 'index.html'));

  const splashLoadPromise = (DEV_URL
    ? splashWindow.loadURL(`${DEV_URL}/splash.html`)
    : splashWindow.loadFile(path.join(DIST, 'splash.html')))
    .then(() => {
      if (!mainRevealed && splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.showInactive();
      }
    })
    .catch((error) => console.warn('[Splash load]', error));

  await mainLoadPromise;
  revealMain();
  void splashLoadPromise;
}

app.on('second-instance', () => restoreMainWindow());
app.whenReady().then(async () => {
  loadDesktopPreferences();
  registerIpc();
  configurePermissions(session.defaultSession);
  startOAuthServer();
  await createWindows();
});
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && !isQuitting) return;
  if (isQuitting) app.quit();
});
app.on('activate', () => restoreMainWindow());
app.on('before-quit', () => {
  isQuitting = true;
  captureWindowStateNow();
  try { oauthServer?.close(); } catch {}
  oauthServer = null;
  try { tray?.destroy(); } catch {}
  tray = null;
});
