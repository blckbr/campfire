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

export type CampfireDesktopPreferences = {
  uiScale: number;
  language: CampfireLanguagePreference;
  closeBehavior: CampfireCloseBehavior;
  systemLocale: Exclude<CampfireLanguagePreference, "system">;
  effectiveLanguage: Exclude<CampfireLanguagePreference, "system">;
  appVersion: string;
};

type DesktopBridge = {
  app: { onAuthCallback: (callback: (url: string) => void) => () => void };
  desktop: {
    getPreferences: () => Promise<CampfireDesktopPreferences>;
    updatePreferences: (patch: Partial<Pick<CampfireDesktopPreferences, "uiScale" | "language" | "closeBehavior">>) => Promise<CampfireDesktopPreferences>;
    closeAction: (action: CampfireCloseBehavior | "cancel", remember?: boolean) => Promise<boolean>;
    onPreferencesChanged: (callback: (preferences: CampfireDesktopPreferences) => void) => () => void;
    onLogoutRequest: (callback: () => void) => () => void;
  };
  shell: { openExternal: (url: string) => Promise<boolean> };
  clipboard: { writeText: (text: string) => Promise<boolean> };
  window: { show: () => Promise<boolean>; unminimize: () => Promise<boolean>; focus: () => Promise<boolean>; setFullscreen: (enabled: boolean) => Promise<boolean> };
  anime: {
    create: (payload: { label: string; url: string; bounds: Bounds }) => Promise<unknown>;
    close: (label: string) => Promise<boolean>;
    hide: (label: string) => Promise<boolean>;
    show: (label: string) => Promise<boolean>;
    focus: (label: string) => Promise<boolean>;
    setBounds: (label: string, bounds: Bounds) => Promise<boolean>;
    getUrl: (label: string) => Promise<string>;
    eval: (label: string, script: string) => Promise<unknown>;
  };
  screen: { setPreference: (mode: string) => Promise<boolean> };
  watch: { prepareAnimeCapture: () => Promise<{ok:boolean;message?:string;hasVideo?:boolean;frameUrl?:string}>; stopAnimeCapture: () => Promise<boolean> };
};

declare global { interface Window { campfireDesktop?: DesktopBridge } }

function bridge(): DesktopBridge {
  if (!window.campfireDesktop) throw new Error('Campfire Desktop Bridge não está disponível. Abra o aplicativo pelo Electron.');
  return window.campfireDesktop;
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
}

export function getCurrentWindow() {
  return {
    show: () => bridge().window.show(),
    unminimize: () => bridge().window.unminimize(),
    setFocus: () => bridge().window.focus(),
    setFullscreen: (enabled:boolean) => bridge().window.setFullscreen(enabled),
  };
}

export async function openUrl(url:string) { return await bridge().shell.openExternal(url); }

export async function listen<T>(event:string, callback:(event:{payload:T})=>void) {
  if (event !== 'campfire-auth-callback') return () => undefined;
  return bridge().app.onAuthCallback((payload) => callback({payload: payload as T}));
}

export async function invoke<T=unknown>(command:string,args:Record<string,unknown>={}) : Promise<T> {
  if (command === 'campfire_anime_webview_url') return await bridge().anime.getUrl(String(args.webviewLabel || '')) as T;
  if (command === 'campfire_anime_webview_eval') return await bridge().anime.eval(String(args.webviewLabel || ''), String(args.script || '')) as T;
  throw new Error(`Comando desktop não suportado: ${command}`);
}

export async function setDisplayCapturePreference(mode:'monitor'|'window') { return await bridge().screen.setPreference(mode); }
export async function prepareAnimeWatchCapture() { return await bridge().watch.prepareAnimeCapture(); }
export async function stopAnimeWatchCapture() { return await bridge().watch.stopAnimeCapture(); }

export async function getDesktopPreferences(): Promise<CampfireDesktopPreferences> {
  return await bridge().desktop.getPreferences();
}

export async function updateDesktopPreferences(
  patch: Partial<Pick<CampfireDesktopPreferences, "uiScale" | "language" | "closeBehavior">>
): Promise<CampfireDesktopPreferences> {
  return await bridge().desktop.updatePreferences(patch);
}

export function onDesktopPreferencesChanged(
  callback: (preferences: CampfireDesktopPreferences) => void
) {
  return bridge().desktop.onPreferencesChanged(callback);
}

export function onDesktopLogoutRequest(callback: () => void) {
  return bridge().desktop.onLogoutRequest(callback);
}

