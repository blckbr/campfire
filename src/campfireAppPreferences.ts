export type CampfireAppPreferences = {
  systemNotifications: boolean;
  notificationSound: boolean;
  confirmExternalLinks: boolean;
};

const STORAGE_KEY = "campfire.app.preferences.v1";

const DEFAULTS: CampfireAppPreferences = {
  systemNotifications: true,
  notificationSound: true,
  confirmExternalLinks: true,
};

export const CAMPFIRE_APP_PREFERENCES_CHANGED_EVENT = "campfire-app-preferences-changed";
export const CAMPFIRE_LAYOUT_RESET_EVENT = "campfire-layout-reset";

export function loadCampfireAppPreferences(): CampfireAppPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<CampfireAppPreferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCampfireAppPreferences(
  patch: Partial<CampfireAppPreferences>
): CampfireAppPreferences {
  const next = { ...loadCampfireAppPreferences(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The preference still applies to the current render even if storage is restricted.
  }
  window.dispatchEvent(new CustomEvent(CAMPFIRE_APP_PREFERENCES_CHANGED_EVENT, { detail: next }));
  return next;
}

export async function requestSystemNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function showCampfireSystemNotification(title: string, body: string): boolean {
  const preferences = loadCampfireAppPreferences();
  if (!preferences.systemNotifications || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }
  try {
    const notification = new Notification(title, { body, tag: "campfire-message" });
    notification.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}

export function playCampfireNotificationChime(): boolean {
  if (!loadCampfireAppPreferences().notificationSound) return false;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return false;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener("ended", () => void context.close());
    return true;
  } catch {
    return false;
  }
}

export function resetCampfireLayout(): void {
  try {
    localStorage.removeItem("campfire.layout.leftRailWidth");
    localStorage.removeItem("campfire.layout.rightRailWidth");
  } catch {
    // Ignore storage restrictions; event still resets the live UI.
  }
  window.dispatchEvent(new Event(CAMPFIRE_LAYOUT_RESET_EVENT));
}
