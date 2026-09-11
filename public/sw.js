const CACHE = "campfire-web-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/campfire-icon.png"];
const PRIVATE_API_PATHS = ["/rest/v1", "/auth/v1", "/functions/v1", "/storage/v1"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_API_PATHS.some((path) => url.pathname.startsWith(path))) return;
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") return;

  const staticDestination = ["script", "style", "image", "font", "worker"].includes(request.destination);
  const navigation = request.mode === "navigate";
  if (!staticDestination && !navigation) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && staticDestination) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        if (navigation) return (await caches.match("/")) ?? Response.error();
        return (await caches.match(request)) ?? Response.error();
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => "focus" in client);
    if (existing) return existing.focus();
    return self.clients.openWindow("/");
  })());
});
