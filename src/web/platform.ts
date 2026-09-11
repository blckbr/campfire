const CONNECTION_KEY = "campfire.web.connectionId";
const INVITE_PREFIX = "/invite/";
const OAUTH_CALLBACK_PATH = "/auth/callback";

export function isCampfireDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.campfireDesktop);
}

export function isCampfireWeb(): boolean {
  return typeof window !== "undefined" && !isCampfireDesktop();
}

export function installCampfireRuntimeMarker(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.campfireRuntime =
    isCampfireDesktop() ? "desktop" : "web";
}

export function campfireConnectionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const current = sessionStorage.getItem(CONNECTION_KEY);
    if (current) return current;
    const next = crypto.randomUUID();
    sessionStorage.setItem(CONNECTION_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function webInviteToken(pathname = window.location.pathname): string | null {
  if (!pathname.startsWith(INVITE_PREFIX)) return null;
  const match = pathname.match(/^\/invite\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function webOAuthRedirectUrl(): string {
  if (isCampfireDesktop()) return "http://127.0.0.1:54321/auth/callback";
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
}

export function webOAuthCallbackUrl(): string | null {
  if (!isCampfireWeb()) return null;

  const current = new URL(window.location.href);

  if (current.pathname === OAUTH_CALLBACK_PATH) {
    return current.href;
  }

  const hasOAuthResponse =
    current.searchParams.has("code") ||
    current.searchParams.has("error") ||
    current.searchParams.has("error_description");

  if (current.pathname === "/" && hasOAuthResponse) {
    const normalized = new URL(OAUTH_CALLBACK_PATH, current.origin);
    normalized.search = current.search;
    normalized.hash = current.hash;
    return normalized.href;
  }

  return null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
