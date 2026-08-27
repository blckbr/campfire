export type UserLocalMediaPreference = {
  effectsMuted: boolean;
  videoHidden: boolean;
};

const STORAGE_KEY = "campfire.local-user-media-preferences.v1";
export const CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT = "campfire-user-media-preferences-change";

function readAll(): Record<string, UserLocalMediaPreference> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Partial<UserLocalMediaPreference>>;
    const result: Record<string, UserLocalMediaPreference> = {};
    for (const [userId, value] of Object.entries(parsed)) {
      result[userId] = {
        effectsMuted: value.effectsMuted === true,
        videoHidden: value.videoHidden === true,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, UserLocalMediaPreference>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local-only preference persistence is best effort.
  }
}

export function getUserLocalMediaPreference(userId: string): UserLocalMediaPreference {
  return readAll()[userId] ?? { effectsMuted: false, videoHidden: false };
}

export function setUserLocalMediaPreference(
  userId: string,
  patch: Partial<UserLocalMediaPreference>,
): UserLocalMediaPreference {
  const all = readAll();
  const next = {
    ...(all[userId] ?? { effectsMuted: false, videoHidden: false }),
    ...patch,
  };
  all[userId] = next;
  writeAll(all);
  window.dispatchEvent(new CustomEvent(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, {
    detail: { userId, preference: next },
  }));
  return next;
}


const USER_VOLUME_KEY = "campfire.voice.userVolumes.v1";

export function getUserVolume(userId: string): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_VOLUME_KEY) ?? "{}") as Record<string, unknown>;
    const value = Number(parsed[userId]);
    return Number.isFinite(value) ? Math.max(0, Math.min(200, Math.round(value))) : 100;
  } catch {
    return 100;
  }
}

export function setUserVolume(userId: string, value: number): number {
  const nextValue = Number.isFinite(value) ? Math.max(0, Math.min(200, Math.round(value))) : 100;
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_VOLUME_KEY) ?? "{}") as Record<string, unknown>;
    parsed[userId] = nextValue;
    localStorage.setItem(USER_VOLUME_KEY, JSON.stringify(parsed));
  } catch {
    // Persistência local é opcional.
  }
  window.dispatchEvent(new CustomEvent(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, {
    detail: { userId, volume: nextValue },
  }));
  return nextValue;
}
