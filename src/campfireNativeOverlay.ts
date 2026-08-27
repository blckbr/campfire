export const CAMPFIRE_NATIVE_OVERLAY_EVENT =
  "campfire-native-overlay-change";

const blockers = new Set<string>();

export function isCampfireNativeOverlayBlocked(): boolean {
  return blockers.size > 0;
}

export function setCampfireNativeOverlayBlock(
  source: string,
  blocked: boolean
): void {
  const key = source.trim();

  if (!key) {
    return;
  }

  if (blocked) {
    blockers.add(key);
  } else {
    blockers.delete(key);
  }

  window.dispatchEvent(
    new CustomEvent(CAMPFIRE_NATIVE_OVERLAY_EVENT, {
      detail: {
        blocked: isCampfireNativeOverlayBlocked(),
        sources: [...blockers],
      },
    })
  );
}
