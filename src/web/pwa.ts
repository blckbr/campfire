export async function registerCampfirePwa(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("CampfireWeb: service worker indisponível", error);
    return null;
  }
}

export async function requestCampfireNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

export async function showCampfireNotification(
  title: string,
  options: NotificationOptions = {}
): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: "/campfire-icon.png",
        badge: "/campfire-icon.png",
        tag: "campfire-chat",
        ...options,
      });
      return true;
    }
    new Notification(title, { icon: "/campfire-icon.png", ...options });
    return true;
  } catch {
    return false;
  }
}
