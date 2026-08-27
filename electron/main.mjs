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
let capturePreference = 'all';
const animeViews = new Map();

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

function getAnime(label) {
  const rec = animeViews.get(String(label || ''));
  if (!rec || rec.view.webContents.isDestroyed()) return null;
  return rec;
}

function removeAnime(label) {
  const rec = getAnime(label);
  if (!rec) return false;
  try { mainWindow?.contentView.removeChildView(rec.view); } catch {}
  try { rec.view.webContents.close(); } catch {}
  animeViews.delete(label);
  if (activeAnimeLabel === label) activeAnimeLabel = null;
  activeCaptureFrame = null;
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
        isQuitting = true;
        app.quit();
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

function performCloseAction(action) {
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
    isQuitting = true;
    app.quit();
    return true;
  }

  return false;
}

function registerIpc() {
  ipcMain.handle('shell:open-external', async (_e, raw) => {
    const u = new URL(String(raw || ''));
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Somente links HTTP/HTTPS podem ser abertos.');
    await shell.openExternal(u.toString()); return true;
  });
  ipcMain.handle('clipboard:write-text', (_e, raw) => { clipboard.writeText(String(raw ?? '')); return true; });
  ipcMain.handle('window:show', () => { mainWindow?.show(); return true; });
  ipcMain.handle('window:unminimize', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); return true; });
  ipcMain.handle('window:focus', () => { mainWindow?.focus(); return true; });
  ipcMain.handle('window:set-fullscreen', (_e, enabled) => { mainWindow?.setFullScreen(Boolean(enabled)); return true; });
  ipcMain.handle('desktop:get-preferences', () => publicDesktopPreferences());
  ipcMain.handle('desktop:update-preferences', (_event, patch) => applyDesktopPreferencesPatch(patch || {}));
  ipcMain.handle('desktop:close-action', (_event, payload = {}) => {
    const action = ['quit', 'tray', 'logout', 'cancel'].includes(payload.action)
      ? payload.action
      : 'cancel';
    if (payload.remember && action !== 'cancel') {
      desktopPreferences.closeBehavior = action;
      saveDesktopPreferences();
      notifyDesktopPreferencesChanged();
    }
    if (action === 'cancel') {
      restoreAnimeViewsAfterClosePrompt();
      return true;
    }
    return performCloseAction(action);
  });
  ipcMain.handle('screen:set-preference', (_e, mode) => { capturePreference = ['monitor','window'].includes(mode) ? mode : 'all'; return true; });

  ipcMain.handle('anime:create', async (_e, payload = {}) => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Janela principal indisponível.');
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
    animeViews.set(label, { view, visible: true });
    activeAnimeLabel = label;
    mainWindow.contentView.addChildView(view);
    view.webContents.loadURL(url).catch((error) => console.warn('[Anime load]', error));
    return { ok: true, label, url };
  });
  ipcMain.handle('anime:close', (_e, label) => removeAnime(String(label || '')));
  ipcMain.handle('anime:hide', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.setVisible(false); rec.visible=false; return true; });
  ipcMain.handle('anime:show', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.setVisible(true); rec.visible=true; activeAnimeLabel=String(label); return true; });
  ipcMain.handle('anime:focus', (_e, label) => { const rec=getAnime(label); if(!rec)return false; rec.view.webContents.focus(); activeAnimeLabel=String(label); return true; });
  ipcMain.handle('anime:set-bounds', (_e, label, bounds) => { const rec=getAnime(label); if(!rec)return false; rec.view.setBounds(safeBounds(bounds)); return true; });
  ipcMain.handle('anime:get-url', (_e, label) => getAnime(label)?.view.webContents.getURL() || '');
  ipcMain.handle('anime:eval', async (_e, label, script) => { const rec=getAnime(label); if(!rec)throw new Error('Navegador de anime não encontrado.'); return await rec.view.webContents.executeJavaScript(String(script || ''), true); });
  ipcMain.handle('watch:prepare-anime-capture', async () => {
    const rec = getAnime(activeAnimeLabel);
    if (!rec) return { ok: false, message: 'Abra o anime dentro do Campfire antes de transmitir.' };
    const selected = await findBestMediaFrame(rec.view);
    if (!selected?.frame || selected.frame.detached) return { ok: false, message: 'Não encontrei um frame capturável.' };
    activeCaptureFrame = selected.frame;
    return { ok: true, hasVideo: Boolean(selected.info?.hasVideo), frameUrl: selected.info?.url || selected.frame.url };
  });
  ipcMain.handle('watch:stop-anime-capture', () => { activeCaptureFrame = null; return true; });
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


function installEditableTextContextMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;

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

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
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
    title: 'Campfire Black Piano',
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
    performCloseAction(action);
  });
  mainWindow.on('closed', () => {
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
