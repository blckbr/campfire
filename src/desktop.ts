import { isCampfireDesktop } from "./web/platform";
import { loadCampfireAppPreferences } from "./campfireAppPreferences";
import { shouldConfirmExternalUrl } from "./campfireExternalLinkPolicy";

type Bounds = { x: number; y: number; width: number; height: number };
export type CampfireLanguagePreference =
  | "system"
  | "pt-BR"
  | "en-US"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "it-IT";

export type CampfireCloseBehavior =
  | "ask"
  | "quit"
  | "tray"
  | "logout";


export type CampfireWorkspaceKind = "messages" | "anime" | "screen";
export type CampfireWorkspaceOpenRequest = {
  kind: CampfireWorkspaceKind;
  campfireId: string;
};

export type CampfireAssistantSource = { label: string; url: string };
export type CampfireAssistantReply = { answer: string; sources: CampfireAssistantSource[] };
export type CampfireNewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
};

export type CampfireDesktopPreferences = {
  uiScale: number;
  language: CampfireLanguagePreference;
  closeBehavior: CampfireCloseBehavior;
  systemLocale: Exclude<CampfireLanguagePreference, "system">;
  effectiveLanguage: Exclude<CampfireLanguagePreference, "system">;
  appVersion: string;
};

type DesktopBridge = {
  app: {
    onAuthCallback: (callback: (url: string) => void) => () => void;
    onFireOutStart: (callback: (payload: { durationMs?: number }) => void) => () => void;
    onFireOutStop: (callback: () => void) => () => void;
  };
  desktop: {
    getPreferences: () => Promise<CampfireDesktopPreferences>;
    updatePreferences: (patch: Partial<Pick<CampfireDesktopPreferences, "uiScale" | "language" | "closeBehavior">>) => Promise<CampfireDesktopPreferences>;
    closeAction: (action: CampfireCloseBehavior | "cancel", remember?: boolean) => Promise<boolean>;
    onPreferencesChanged: (callback: (preferences: CampfireDesktopPreferences) => void) => () => void;
    onLogoutRequest: (callback: () => void) => () => void;
  };
  shell: { openExternal: (url: string) => Promise<boolean> };
  assistant: { query: (query: string) => Promise<CampfireAssistantReply> };
  news: { get: (query?: string) => Promise<CampfireNewsItem[]> };
  clipboard: { writeText: (text: string) => Promise<boolean> };
  window: { show: () => Promise<boolean>; unminimize: () => Promise<boolean>; focus: () => Promise<boolean>; setFullscreen: (enabled: boolean) => Promise<boolean> };
  workspace: {
    open: (payload: CampfireWorkspaceOpenRequest) => Promise<boolean>;
  };
  anime: {
    create: (payload: { label: string; url: string; bounds: Bounds }) => Promise<unknown>;
    close: (label: string) => Promise<boolean>;
    hide: (label: string) => Promise<boolean>;
    show: (label: string) => Promise<boolean>;
    focus: (label: string) => Promise<boolean>;
    setBounds: (label: string, bounds: Bounds) => Promise<boolean>;
    getUrl: (label: string) => Promise<string>;
    eval: (label: string, script: string) => Promise<unknown>;
    setPlayerFullscreen: (label: string, enabled: boolean) => Promise<boolean>;
    onPlayerFullscreenChanged: (callback: (payload: { label: string; enabled: boolean }) => void) => () => void;
  };
  screen: { setPreference: (mode: string) => Promise<boolean> };
  watch: { prepareAnimeCapture: () => Promise<{ok:boolean;message?:string;hasVideo?:boolean;frameUrl?:string}>; stopAnimeCapture: () => Promise<boolean> };
};

declare global { interface Window { campfireDesktop?: DesktopBridge } }

function bridge(): DesktopBridge {
  if (!window.campfireDesktop) throw new Error('Campfire Desktop Bridge não está disponível.');
  return window.campfireDesktop;
}

let fireOutAudio: HTMLAudioElement | null = null;
let fireOutStopTimer: number | null = null;
let appSoundBridgeInstalled = false;
const FIRE_OUT_EFFECT_VOLUME = 0.10;

function stopCampfireFireOutSound() {
  if (fireOutStopTimer !== null) {
    window.clearTimeout(fireOutStopTimer);
    fireOutStopTimer = null;
  }
  if (fireOutAudio) {
    fireOutAudio.pause();
    fireOutAudio.currentTime = 0;
    fireOutAudio = null;
  }
}

function playCampfireFireOutSound(payload: { durationMs?: number } = {}) {
  stopCampfireFireOutSound();
  const preferences = loadCampfireAppPreferences();
  if (!preferences.notificationSound) return;

  const durationMs = Math.max(0, Math.min(2000, Number(payload.durationMs) || 2000));
  const audioUrl = new URL("./audio/campfire-fire-out.wav", window.location.href).toString();
  const audio = new Audio(audioUrl);
  audio.preload = "auto";
  audio.volume = FIRE_OUT_EFFECT_VOLUME;
  fireOutAudio = audio;
  void audio.play().catch((error) => {
    console.warn("Não foi possível tocar o som de apagar a fogueira:", error);
  });
  fireOutStopTimer = window.setTimeout(stopCampfireFireOutSound, durationMs);
}

function installCampfireAppSoundBridge() {
  if (appSoundBridgeInstalled || !isCampfireDesktop()) return;
  appSoundBridgeInstalled = true;
  bridge().app.onFireOutStart(playCampfireFireOutSound);
  bridge().app.onFireOutStop(stopCampfireFireOutSound);
}

if (typeof window !== "undefined") {
  installCampfireAppSoundBridge();
}

function localPreferences(): CampfireDesktopPreferences {
  const language = (localStorage.getItem('campfire.web.language') || 'system') as CampfireLanguagePreference;
  const locale = navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
  const effectiveLanguage = language === 'system' ? locale : language;
  return { uiScale: Number(localStorage.getItem('campfire.web.uiScale') || 1), language, closeBehavior: 'ask', systemLocale: locale, effectiveLanguage, appVersion: 'Web 1.0.0' };
}

const boundsCache = new Map<string, Bounds>();

export class LogicalPosition { constructor(public x: number, public y: number) {} }
export class LogicalSize { constructor(public width: number, public height: number) {} }

export class Webview {
  ready: Promise<void>;
  handlers = new Map<string, Array<(event: unknown) => void>>();

  constructor(_parent: unknown, public label: string, options: {url:string;x:number;y:number;width:number;height:number;focus?:boolean;javascriptDisabled?:boolean;devtools?:boolean;backgroundColor?:string}) {
    const bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
    boundsCache.set(label, bounds);
    this.ready = bridge().anime.create({ label, url: options.url, bounds })
      .then(() => { this.emit('tauri://created', { payload: null }); })
      .catch((error) => { this.emit('tauri://error', { payload: error }); throw error; });
  }

  static async getByLabel(label: string): Promise<Webview | null> {
    try {
      const url = await bridge().anime.getUrl(label);
      if (!url) return null;
      const item = Object.create(Webview.prototype) as Webview;
      item.label = label;
      item.handlers = new Map();
      item.ready = Promise.resolve();
      return item;
    } catch { return null; }
  }

  private emit(event: string, payload: unknown) {
    for (const callback of this.handlers.get(event) || []) callback(payload);
    this.handlers.delete(event);
  }

  once(event: string, handler: (event: unknown) => void) {
    const list = this.handlers.get(event) || [];
    list.push(handler);
    this.handlers.set(event, list);
    return Promise.resolve(() => undefined);
  }

  async close() { await this.ready.catch(() => undefined); boundsCache.delete(this.label); await bridge().anime.close(this.label); }
  async hide() { await this.ready; await bridge().anime.hide(this.label); }
  async show() { await this.ready; await bridge().anime.show(this.label); }
  async setAutoResize(_value: boolean) { await this.ready; }
  async setPosition(position: {x?:number;y?:number}) {
    await this.ready;
    const current = boundsCache.get(this.label) || {x:0,y:0,width:1,height:1};
    const next = {...current,x:Number(position.x)||0,y:Number(position.y)||0};
    boundsCache.set(this.label,next); await bridge().anime.setBounds(this.label,next);
  }
  async setSize(size: {width?:number;height?:number}) {
    await this.ready;
    const current = boundsCache.get(this.label) || {x:0,y:0,width:1,height:1};
    const next = {...current,width:Math.max(1,Number(size.width)||1),height:Math.max(1,Number(size.height)||1)};
    boundsCache.set(this.label,next); await bridge().anime.setBounds(this.label,next);
  }
  async setFocus() { await this.ready; await bridge().anime.focus(this.label); }
  async setPlayerFullscreen(enabled: boolean) { await this.ready; return await bridge().anime.setPlayerFullscreen(this.label, enabled); }
}

export function getCurrentWindow() {
  if (!isCampfireDesktop()) {
    return {
      show: async () => true,
      unminimize: async () => true,
      setFocus: async () => { window.focus(); return true; },
      setFullscreen: async (enabled:boolean) => {
        if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
        if (!enabled && document.fullscreenElement) await document.exitFullscreen?.();
        return true;
      },
    };
  }
  return {
    show: () => bridge().window.show(),
    unminimize: () => bridge().window.unminimize(),
    setFocus: () => bridge().window.focus(),
    setFullscreen: (enabled:boolean) => bridge().window.setFullscreen(enabled),
  };
}

export async function openCampfireWorkspaceWindow(
  payload: CampfireWorkspaceOpenRequest
): Promise<boolean> {
  if (!isCampfireDesktop()) return false;
  return await bridge().workspace.open(payload);
}

export async function askCampfireAssistant(query: string): Promise<CampfireAssistantReply> {
  const clean = query.trim();
  if (!clean) throw new Error("Digite uma pergunta para a IA do Campfire.");
  if (!isCampfireDesktop()) {
    throw new Error("A pesquisa ao vivo da IA do Campfire está disponível no aplicativo Desktop.");
  }
  return await bridge().assistant.query(clean);
}

export async function getCampfireNews(query = ""): Promise<CampfireNewsItem[]> {
  if (!isCampfireDesktop()) {
    throw new Error("O feed de notícias ao vivo está disponível no aplicativo Desktop.");
  }
  return await bridge().news.get(query);
}

export async function openUrl(url:string) {
  const preferences = loadCampfireAppPreferences();
  const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  if (shouldConfirmExternalUrl(url, preferences.confirmExternalLinks, configuredSupabaseUrl)) {
    const accepted = window.confirm(`Abrir este link fora do Campfire?

${url}`);
    if (!accepted) return false;
  }
  if (isCampfireDesktop()) return await bridge().shell.openExternal(url);
  window.location.assign(url);
  return true;
}

export async function listen<T>(event:string, callback:(event:{payload:T})=>void) {
  if (event !== 'campfire-auth-callback' || !isCampfireDesktop()) return () => undefined;
  return bridge().app.onAuthCallback((payload) => callback({payload: payload as T}));
}

export async function invoke<T=unknown>(command:string,args:Record<string,unknown>={}) : Promise<T> {
  if (command === 'campfire_anime_webview_url') return await bridge().anime.getUrl(String(args.webviewLabel || '')) as T;
  if (command === 'campfire_anime_webview_eval') return await bridge().anime.eval(String(args.webviewLabel || ''), String(args.script || '')) as T;
  throw new Error(`Comando desktop não suportado: ${command}`);
}

export async function setDisplayCapturePreference(mode:'monitor'|'window') {
  if (!isCampfireDesktop()) return true;
  return await bridge().screen.setPreference(mode);
}
export async function prepareAnimeWatchCapture() {
  if (!isCampfireDesktop()) return { ok: false, message: 'A captura direta de anime é exclusiva do Campfire Desktop.' };
  return await bridge().watch.prepareAnimeCapture();
}
export async function stopAnimeWatchCapture() {
  if (!isCampfireDesktop()) return true;
  return await bridge().watch.stopAnimeCapture();
}

export function onAnimePlayerFullscreenChanged(
  callback: (payload: { label: string; enabled: boolean }) => void
) {
  if (!isCampfireDesktop()) return () => undefined;
  return bridge().anime.onPlayerFullscreenChanged(callback);
}

export async function getDesktopPreferences(): Promise<CampfireDesktopPreferences> {
  if (!isCampfireDesktop()) return localPreferences();
  return await bridge().desktop.getPreferences();
}

export async function updateDesktopPreferences(
  patch: Partial<Pick<CampfireDesktopPreferences, "uiScale" | "language" | "closeBehavior">>
): Promise<CampfireDesktopPreferences> {
  if (!isCampfireDesktop()) {
    if (patch.uiScale != null) localStorage.setItem('campfire.web.uiScale', String(patch.uiScale));
    if (patch.language) localStorage.setItem('campfire.web.language', patch.language);
    return localPreferences();
  }
  return await bridge().desktop.updatePreferences(patch);
}

export function onDesktopPreferencesChanged(
  callback: (preferences: CampfireDesktopPreferences) => void
) {
  if (!isCampfireDesktop()) return () => undefined;
  return bridge().desktop.onPreferencesChanged(callback);
}

export function onDesktopLogoutRequest(callback: () => void) {
  if (!isCampfireDesktop()) return () => undefined;
  return bridge().desktop.onLogoutRequest(callback);
}

