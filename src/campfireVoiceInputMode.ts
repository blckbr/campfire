export type CampfireVoiceInputMode = "voice-activity" | "push-to-talk";

export type CampfirePushToTalkBinding = {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
} | null;

export type CampfireVoiceInputSettings = {
  mode: CampfireVoiceInputMode;
  binding: CampfirePushToTalkBinding;
};

export const CAMPFIRE_VOICE_INPUT_SETTINGS_KEY = "campfire.voice.input.v1";
export const CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT = "campfire-voice-input-settings-change";

export const DEFAULT_CAMPFIRE_VOICE_INPUT_SETTINGS: CampfireVoiceInputSettings = {
  mode: "voice-activity",
  binding: null,
};

const MODIFIER_ONLY_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

function normalizeBinding(value: unknown): CampfirePushToTalkBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<NonNullable<CampfirePushToTalkBinding>>;
  if (typeof candidate.code !== "string" || !candidate.code.trim()) return null;
  const code = candidate.code.trim();
  if (MODIFIER_ONLY_CODES.has(code)) return null;
  return {
    code,
    ctrl: candidate.ctrl === true,
    alt: candidate.alt === true,
    shift: candidate.shift === true,
    meta: candidate.meta === true,
  };
}

export function loadCampfireVoiceInputSettings(): CampfireVoiceInputSettings {
  try {
    const raw = localStorage.getItem(CAMPFIRE_VOICE_INPUT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CAMPFIRE_VOICE_INPUT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CampfireVoiceInputSettings>;
    return {
      mode: parsed.mode === "push-to-talk" ? "push-to-talk" : "voice-activity",
      binding: normalizeBinding(parsed.binding),
    };
  } catch {
    return { ...DEFAULT_CAMPFIRE_VOICE_INPUT_SETTINGS };
  }
}

export function saveCampfireVoiceInputSettings(
  settings: CampfireVoiceInputSettings
): CampfireVoiceInputSettings {
  const normalized: CampfireVoiceInputSettings = {
    mode: settings.mode === "push-to-talk" ? "push-to-talk" : "voice-activity",
    binding: normalizeBinding(settings.binding),
  };
  try {
    localStorage.setItem(CAMPFIRE_VOICE_INPUT_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Persistência local é opcional.
  }
  window.dispatchEvent(new CustomEvent(CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}

export function campfirePushToTalkBindingFromEvent(
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">
): CampfirePushToTalkBinding {
  const code = typeof event.code === "string" ? event.code.trim() : "";
  if (!code || MODIFIER_ONLY_CODES.has(code)) return null;
  return {
    code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function isCampfireVoiceTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.matches("input, textarea, select")) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function matchesCampfirePushToTalkBinding(
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  binding: CampfirePushToTalkBinding
): boolean {
  if (!binding) return false;
  return (
    event.code === binding.code &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  );
}

export function formatCampfirePushToTalkBinding(binding: CampfirePushToTalkBinding): string {
  if (!binding) return "Nenhuma tecla gravada";
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  if (binding.meta) parts.push("Meta");
  parts.push(binding.code.replace(/^Key/, "").replace(/^Digit/, ""));
  return parts.join(" + ");
}
