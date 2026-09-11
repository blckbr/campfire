import { useEffect, useState } from "react";
import { isCampfireWeb } from "./platform";
import { requestCampfireNotifications } from "./pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DOWNLOADS = [
  { kind: "windowsSetup", label: "Windows Setup", detail: "x64 · instalador" },
  { kind: "windowsPortable", label: "Windows Portable", detail: "x64 · sem instalação" },
  { kind: "linuxRpm", label: "Linux RPM", detail: "x86_64 · Red Hat / Fedora" },
  { kind: "linuxAppImage", label: "Linux AppImage", detail: "x86_64 · portátil" },
] as const;

export default function WebInstallControls({ allowNotifications = false }: { allowNotifications?: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (!isCampfireWeb()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!isCampfireWeb()) return null;

  async function enableNotifications() {
    const permission = await requestCampfireNotifications();
    setNotificationPermission(permission);
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "web" }));
    setInstallPrompt(null);
  }

  return (
    <aside className="campfireWebInstallControls" aria-label="Opções do aplicativo Campfire">
      {allowNotifications && notificationPermission === "default" && (
        <button type="button" onClick={() => void enableNotifications()}>
          Ativar notificações
        </button>
      )}
      {installPrompt && (
        <button type="button" onClick={() => void install()}>
          Instalar Campfire
        </button>
      )}
      <details className="campfireWebDownloadMenu">
        <summary>Baixar Desktop <span aria-hidden="true">▾</span></summary>
        <div className="campfireWebDownloadChoices" role="menu" aria-label="Downloads do Campfire 1.1.0">
          {DOWNLOADS.map((download) => (
            <a
              key={download.kind}
              href={`/api/desktop-download?asset=${download.kind}`}
              role="menuitem"
            >
              <strong>{download.label}</strong>
              <small>{download.detail}</small>
            </a>
          ))}
        </div>
      </details>
    </aside>
  );
}
