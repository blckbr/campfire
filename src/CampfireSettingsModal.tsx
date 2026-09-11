import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  loadCampfireMediaSettings,
  saveCampfireMediaSettings,
  videoInputConstraint,
  type CampfireMediaSettings,
  type CampfireVoiceProfile,
  type CampfireGateMode,
  type CampfireVideoQuality,
} from "./campfireMediaSettings";
import {
  campfirePushToTalkBindingFromEvent,
  formatCampfirePushToTalkBinding,
  loadCampfireVoiceInputSettings,
  saveCampfireVoiceInputSettings,
  type CampfireVoiceInputMode,
  type CampfireVoiceInputSettings,
} from "./campfireVoiceInputMode";
import { useCampfireMicrophoneTest } from "./useCampfireMicrophoneTest";
import CampfireSelect from "./CampfireSelect";
import CampfireVoiceChannelManager from "./CampfireVoiceChannelManager";
import { useCampfireModeration } from "./useCampfireModeration";
import { supabase } from "./lib/supabase";
import {
  loadCampfireAppPreferences,
  saveCampfireAppPreferences,
  requestSystemNotificationPermission,
  resetCampfireLayout,
  type CampfireAppPreferences,
} from "./campfireAppPreferences";
import {
  getDesktopPreferences,
  onDesktopPreferencesChanged,
  updateDesktopPreferences,
  type CampfireDesktopPreferences,
  type CampfireLanguagePreference,
  type CampfireCloseBehavior,
} from "./desktop";
import "./CampfireSettingsModal.css";

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  campfireId?: string | null;
  isCampfireOwner?: boolean;
};

const MAX_MIC_RECORDING_MS = 15_000;
const OUTGOING_VOLUME_KEY = "campfire.voice.outgoingVolume.v1";
const MONITOR_VOLUME_KEY = "campfire.voice.monitorVolume.v1";

type MicrophoneTestMode = "live" | "record";

function clampTestVolume(value: number): number {
  return Math.max(0, Math.min(200, Math.round(Number.isFinite(value) ? value : 100)));
}

function loadTestVolume(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? clampTestVolume(value) : 100;
  } catch {
    return 100;
  }
}

function saveTestVolume(key: string, value: number) {
  try { localStorage.setItem(key, String(clampTestVolume(value))); } catch { /* optional */ }
}

function deviceLabel(
  device: MediaDeviceInfo,
  index: number,
  fallback: string
): string {
  return (
    device.label ||
    `${fallback} ${index + 1}`
  );
}

function CampfireSettingsModal({
  open,
  onClose,
  campfireId = null,
  isCampfireOwner = false,
}: Props) {
  const moderation = useCampfireModeration(campfireId ?? "", Boolean(campfireId && isCampfireOwner));
  const [settings, setSettings] =
    useState<CampfireMediaSettings>(
      loadCampfireMediaSettings
    );

  type SettingsTab =
    | "general"
    | "media"
    | "notifications"
    | "privacy"
    | "connections"
    | "shortcuts"
    | "advanced";

  const [activeTab, setActiveTab] =
    useState<SettingsTab>("general");

  const [desktopPreferences, setDesktopPreferences] =
    useState<CampfireDesktopPreferences | null>(null);

  const [devices, setDevices] =
    useState<MediaDeviceInfo[]>([]);

  const [message, setMessage] =
    useState("");

  const [appPreferences, setAppPreferences] =
    useState<CampfireAppPreferences>(loadCampfireAppPreferences);

  const [connectionTesting, setConnectionTesting] = useState(false);

  const [testing, setTesting] =
    useState(false);

  const [voiceInputSettings, setVoiceInputSettings] =
    useState<CampfireVoiceInputSettings>(loadCampfireVoiceInputSettings);

  const [recordingPushToTalk, setRecordingPushToTalk] =
    useState(false);

  const [microphoneTestMode, setMicrophoneTestMode] =
    useState<MicrophoneTestMode>("live");

  const [micTestOutgoingVolume, setMicTestOutgoingVolume] =
    useState(() => loadTestVolume(OUTGOING_VOLUME_KEY));

  const [micTestMonitorVolume, setMicTestMonitorVolume] =
    useState(() => loadTestVolume(MONITOR_VOLUME_KEY));

  const [micRecording, setMicRecording] = useState(false);
  const [micRecordingElapsed, setMicRecordingElapsed] = useState(0);
  const [micRecordingUrl, setMicRecordingUrl] = useState("");

  const previewRef =
    useRef<HTMLVideoElement | null>(null);

  const testStreamRef =
    useRef<MediaStream | null>(null);

  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderChunksRef = useRef<Blob[]>([]);
  const micRecordingStopTimerRef = useRef<number | null>(null);
  const micRecordingTickTimerRef = useRef<number | null>(null);
  const micRecordingStartedAtRef = useRef(0);
  const micRecordingDiscardRef = useRef(false);
  const micPlaybackRef = useRef<HTMLAudioElement | null>(null);

  const microphoneTest = useCampfireMicrophoneTest(
    settings,
    micTestOutgoingVolume,
    micTestMonitorVolume
  );

  async function refreshDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return [];
    }

    try {
      const list =
        await navigator.mediaDevices.enumerateDevices();

      setDevices(list);
      return list;
    } catch (deviceError) {
      console.warn(
        "Não foi possível enumerar dispositivos:",
        deviceError
      );
      setDevices([]);
      return [];
    }
  }

  function clearMicRecordingTimers() {
    if (micRecordingStopTimerRef.current !== null) {
      window.clearTimeout(micRecordingStopTimerRef.current);
      micRecordingStopTimerRef.current = null;
    }
    if (micRecordingTickTimerRef.current !== null) {
      window.clearInterval(micRecordingTickTimerRef.current);
      micRecordingTickTimerRef.current = null;
    }
  }

  function revokeMicRecordingUrl() {
    setMicRecordingUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }

  function stopMicrophoneRecording(discard = false) {
    clearMicRecordingTimers();
    const recorder = micRecorderRef.current;
    micRecordingDiscardRef.current = discard;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      micRecorderRef.current = null;
      setMicRecording(false);
    }
  }

  async function ensureMicrophoneTestStarted() {
    if (!microphoneTest.testing) {
      await microphoneTest.start();
      setTesting(true);
      await refreshDevices();
    }
    return microphoneTest.getProcessedStream();
  }

  async function startLiveMicrophoneMonitor() {
    try {
      await ensureMicrophoneTestStarted();
      microphoneTest.setMonitorSource("processed");
      microphoneTest.setListening(true);
      setMicrophoneTestMode("live");
      setMessage("Monitoramento local ativo. Ajuste volume e qualidade enquanto ouve sua voz processada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível monitorar o microfone.");
    }
  }

  async function stopLiveMicrophoneMonitor() {
    microphoneTest.setListening(false);
    await microphoneTest.stop();
    setTesting(false);
    setMessage("Monitoramento do microfone encerrado.");
  }

  async function startMicrophoneRecording() {
    if (micRecording) return;
    if (typeof MediaRecorder === "undefined") {
      setMessage("Este sistema não disponibilizou gravação local de áudio.");
      return;
    }

    try {
      setMicrophoneTestMode("record");
      microphoneTest.setListening(false);
      await ensureMicrophoneTestStarted();
      const processedStream = microphoneTest.processedStream ?? microphoneTest.getProcessedStream();
      if (!processedStream?.getAudioTracks().length) {
        throw new Error("A voz processada ainda não está pronta para gravação.");
      }

      revokeMicRecordingUrl();
      micRecorderChunksRef.current = [];
      micRecordingDiscardRef.current = false;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(
        processedStream,
        mimeType ? { mimeType } : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) micRecorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearMicRecordingTimers();
        micRecorderRef.current = null;
        setMicRecording(false);
        setMicRecordingElapsed((elapsed) => Math.min(MAX_MIC_RECORDING_MS, elapsed));

        if (micRecordingDiscardRef.current) {
          micRecorderChunksRef.current = [];
          return;
        }

        const blob = new Blob(micRecorderChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        micRecorderChunksRef.current = [];
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setMicRecordingUrl(url);
          setMessage("Gravação pronta. Reproduza para ouvir como sua voz processada ficou.");
        }
      };

      micRecorderRef.current = recorder;
      micRecordingStartedAtRef.current = Date.now();
      setMicRecordingElapsed(0);
      setMicRecording(true);
      recorder.start(250);

      micRecordingTickTimerRef.current = window.setInterval(() => {
        setMicRecordingElapsed(
          Math.min(MAX_MIC_RECORDING_MS, Date.now() - micRecordingStartedAtRef.current)
        );
      }, 100);
      micRecordingStopTimerRef.current = window.setTimeout(() => {
        stopMicrophoneRecording(false);
      }, MAX_MIC_RECORDING_MS);
      setMessage("Gravando sua voz processada localmente. Limite máximo: 15 segundos.");
    } catch (error) {
      stopMicrophoneRecording(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível gravar o teste do microfone.");
    }
  }

  function playMicrophoneRecording() {
    const audio = micPlaybackRef.current;
    if (!audio || !micRecordingUrl) return;
    audio.currentTime = 0;
    void audio.play().catch(() => setMessage("Não foi possível reproduzir o teste do microfone."));
  }

  async function stopTest() {
    stopMicrophoneRecording(true);
    microphoneTest.setListening(false);
    micPlaybackRef.current?.pause();
    testStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());
    testStreamRef.current = null;

    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }

    await microphoneTest.stop();
    setTesting(false);
  }

  async function testDevices() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "Este sistema não disponibilizou microfone/webcam."
      );
      return;
    }

    await stopTest();
    setMessage("");
    setTesting(true);

    try {
      // Sempre abra o microfone primeiro. Em Chromium/Electron, enumerateDevices()
      // pode retornar apenas saídas de áudio antes da primeira permissão; usar essa
      // lista como gate fazia o botão "Permitir e testar" não pedir/capturar o mic.
      // No modo ao vivo, "Permitir e testar" também precisa habilitar o retorno
      // local ANTES de iniciar a pipeline; do contrário o monitorGain nasce em 0.
      const shouldMonitorLive = microphoneTestMode === "live";
      microphoneTest.setMonitorSource("processed");
      microphoneTest.setListening(shouldMonitorLive);
      await microphoneTest.start();

      const refreshedDevices = await refreshDevices();
      const refreshedMicrophones = refreshedDevices.filter(
        (device) => device.kind === "audioinput"
      );
      const hasKnownCamera = refreshedDevices.some(
        (device) => device.kind === "videoinput"
      );

      if (
        settings.audioInputId &&
        !refreshedMicrophones.some(
          (device) => device.deviceId === settings.audioInputId
        )
      ) {
        const nextSettings: CampfireMediaSettings = {
          ...settings,
          audioInputId: "",
        };
        setSettings(nextSettings);
        saveCampfireMediaSettings(nextSettings);
      } else {
        saveCampfireMediaSettings(settings);
      }

      if (hasKnownCamera) {
        try {
          const stream =
            await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: videoInputConstraint(
                settings.videoInputId,
                settings.videoQuality
              ),
            });

          testStreamRef.current = stream;
          const preview = previewRef.current;

          if (preview) {
            preview.srcObject = stream;
            preview.muted = true;
            await preview
              .play()
              .catch(() => undefined);
          }
        } catch (cameraError) {
          console.warn(
            "Webcam indisponível durante o teste; mantendo o microfone ativo:",
            cameraError
          );
        }
      }

      setMessage(
        refreshedMicrophones.length > 0
          ? `${refreshedMicrophones.length} microfone(s) detectado(s). ${shouldMonitorLive ? "Retorno local ativo" : "Captura ativa"} com a cadeia Voice Pro.`
          : shouldMonitorLive
            ? "Microfone capturado pelo padrão do Windows. Retorno local ativo para você se ouvir."
            : "Microfone capturado. O sistema ainda não forneceu nomes de dispositivos; usando o padrão do Windows."
      );
    } catch (testError) {
      await stopTest();

      if (
        testError instanceof DOMException &&
        testError.name === "NotAllowedError"
      ) {
        setMessage(
          "Permissão de microfone/webcam negada."
        );
        return;
      }

      setMessage(
        testError instanceof Error
          ? testError.message
          : "Não foi possível testar os dispositivos."
      );
    }
  }

  function updateSetting<K extends keyof CampfireMediaSettings>(
    key: K,
    value: CampfireMediaSettings[K]
  ) {
    setSettings((current) => {
      const next: CampfireMediaSettings = {
        ...current,
        [key]: value,
      };

      if (key === "voiceProfile") {
        next.audioProfile =
          value === "studio" ? "studio" : "voice";
      }

      saveCampfireMediaSettings(next);

      if (key === "audioInputId") {
        setMessage(
          value
            ? "Microfone selecionado. Se você estiver na voz, a troca será aplicada automaticamente."
            : "Microfone padrão do sistema selecionado. A voz ativa será atualizada automaticamente."
        );
      } else if (microphoneTest.testing) {
        setMessage(
          "Configuração salva. Reinicie o teste local para comparar a nova cadeia de áudio."
        );
      }

      return next;
    });
  }

  function updateVoiceInputMode(mode: CampfireVoiceInputMode) {
    const next = saveCampfireVoiceInputSettings({
      ...voiceInputSettings,
      mode,
    });
    setVoiceInputSettings(next);
    setRecordingPushToTalk(false);
    setMessage(
      mode === "push-to-talk"
        ? next.binding
          ? "Push-to-Talk ativado. Segure a tecla gravada para falar."
          : "Push-to-Talk ativado. Grave uma tecla antes de falar."
        : "Atividade de voz ativada."
    );
  }

  function clearPushToTalkBinding() {
    const next = saveCampfireVoiceInputSettings({
      ...voiceInputSettings,
      binding: null,
    });
    setVoiceInputSettings(next);
    setRecordingPushToTalk(false);
    setMessage("Tecla do Push-to-Talk removida. O microfone ficará silenciado nesse modo até você gravar outra tecla.");
  }

  useEffect(() => {
    if (!open || recordingPushToTalk) return;

    const closeSettingsFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", closeSettingsFromEscape, true);
    return () => window.removeEventListener("keydown", closeSettingsFromEscape, true);
  }, [open, recordingPushToTalk, onClose]);

  useEffect(() => {
    if (!open || !recordingPushToTalk) return;

    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setRecordingPushToTalk(false);
        setMessage("Gravação de Push-to-Talk cancelada.");
        return;
      }
      const binding = campfirePushToTalkBindingFromEvent(event);
      if (!binding) {
        setMessage("Use uma tecla principal; Ctrl, Alt, Shift ou Meta podem ser combinados com ela.");
        return;
      }
      const next = saveCampfireVoiceInputSettings({
        mode: "push-to-talk",
        binding,
      });
      setVoiceInputSettings(next);
      setRecordingPushToTalk(false);
      setMessage(`Push-to-Talk gravado: ${formatCampfirePushToTalkBinding(binding)}.`);
    };

    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [open, recordingPushToTalk, voiceInputSettings]);

  useEffect(() => {
    if (!open) {
      void stopTest();
      return;
    }

    setSettings(
      loadCampfireMediaSettings()
    );
    setAppPreferences(loadCampfireAppPreferences());
    setVoiceInputSettings(loadCampfireVoiceInputSettings());
    setRecordingPushToTalk(false);
    void refreshDevices();

    return () => {
      void stopTest();
      clearMicRecordingTimers();
      micPlaybackRef.current?.pause();
      revokeMicRecordingUrl();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices.addEventListener(
      "devicechange",
      handleDeviceChange
    );
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let disposed = false;

    void getDesktopPreferences()
      .then((preferences) => {
        if (!disposed) {
          setDesktopPreferences(preferences);
        }
      })
      .catch((error) => {
        console.warn("Não foi possível carregar preferências da interface:", error);
      });

    let unlisten: (() => void) | undefined;

    try {
      unlisten = onDesktopPreferencesChanged((preferences) => {
        if (!disposed) {
          setDesktopPreferences(preferences);
        }
      });
    } catch {
      unlisten = undefined;
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  async function updateDesktop(
    patch: Partial<Pick<CampfireDesktopPreferences, "uiScale" | "language" | "closeBehavior">>
  ) {
    try {
      const next = await updateDesktopPreferences(patch);
      setDesktopPreferences(next);
    } catch (error) {
      console.warn("Não foi possível salvar preferências da interface:", error);
    }
  }

  function updateAppPreference<K extends keyof CampfireAppPreferences>(
    key: K,
    value: CampfireAppPreferences[K]
  ) {
    const next = saveCampfireAppPreferences({ [key]: value });
    setAppPreferences(next);
    setMessage("Preferência salva e aplicada.");
  }

  async function enableSystemNotifications() {
    const permission = await requestSystemNotificationPermission();
    if (permission === "granted") {
      const next = saveCampfireAppPreferences({ systemNotifications: true });
      setAppPreferences(next);
      setMessage("Notificações do sistema ativadas.");
    } else if (permission === "unsupported") {
      setMessage("Este ambiente não oferece notificações do sistema.");
    } else {
      const next = saveCampfireAppPreferences({ systemNotifications: false });
      setAppPreferences(next);
      setMessage("A permissão de notificações não foi concedida.");
    }
  }

  async function testSupabaseConnection() {
    setConnectionTesting(true);
    setMessage("Testando conexão real com o Supabase…");
    try {
      const started = performance.now();
      const { error } = await supabase.from("campfires").select("id").limit(1);
      const elapsed = Math.max(1, Math.round(performance.now() - started));
      if (error) {
        setMessage(`Supabase respondeu em ${elapsed} ms, mas a consulta foi recusada: ${error.message}`);
      } else {
        setMessage(`Supabase conectado e respondendo (${elapsed} ms).`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? `Falha de conexão: ${error.message}` : "Falha de conexão com o Supabase.");
    } finally {
      setConnectionTesting(false);
    }
  }

  async function copyConnectionDiagnostic() {
    try {
      const { data } = await supabase.auth.getSession();
      const diagnostic = [
        "Campfire — diagnóstico de conexão",
        `Sessão: ${data.session ? "autenticada" : "sem sessão"}`,
        `Online: ${navigator.onLine ? "sim" : "não"}`,
        `User agent: ${navigator.userAgent}`,
        `Data: ${new Date().toISOString()}`,
      ].join("\n");
      await navigator.clipboard.writeText(diagnostic);
      setMessage("Diagnóstico real copiado para a área de transferência.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível copiar o diagnóstico.");
    }
  }

  function resetLayoutNow() {
    resetCampfireLayout();
    setMessage("Layout redefinido para as larguras padrão.");
  }

  if (!open) {
    return null;
  }

  const microphones = devices.filter(
    (device) => device.kind === "audioinput"
  );

  const cameras = devices.filter(
    (device) => device.kind === "videoinput"
  );

  const speakers = devices.filter(
    (device) => device.kind === "audiooutput"
  );

  const languageValue: CampfireLanguagePreference =
    desktopPreferences?.language ?? "system";

  const closeBehaviorValue: CampfireCloseBehavior =
    desktopPreferences?.closeBehavior ?? "ask";

  const uiScalePercent =
    Math.round((desktopPreferences?.uiScale ?? 1) * 100);

  return (
    <div
      className="campfireSettingsOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="campfireSettingsModal">
        <header>
          <div>
            <span>⚙</span>
            <div>
              <h2>Configurações</h2>
              <p>
                {activeTab === "general"
                  ? "Interface e idioma"
                  : activeTab === "media"
                    ? "Voz e vídeo"
                    : activeTab === "notifications"
                      ? "Notificações"
                      : activeTab === "privacy"
                        ? "Privacidade"
                        : activeTab === "connections"
                          ? "Conexões"
                          : activeTab === "shortcuts"
                            ? "Atalhos"
                            : "Avançado"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="campfireSettingsBody">
          <aside>
            <button
              type="button"
              className={activeTab === "general" ? "active" : ""}
              onClick={() => setActiveTab("general")}
            >
              🖥 Interface e idioma
            </button>

            <button
              type="button"
              className={activeTab === "media" ? "active" : ""}
              onClick={() => setActiveTab("media")}
            >
              🎙 Voz e vídeo
            </button>

            <button
              type="button"
              className={activeTab === "notifications" ? "active" : ""}
              onClick={() => setActiveTab("notifications")}
            >
              🔔 Notificações
            </button>

            <button
              type="button"
              className={activeTab === "privacy" ? "active" : ""}
              onClick={() => setActiveTab("privacy")}
            >
              🔒 Privacidade
            </button>

            <button
              type="button"
              className={activeTab === "connections" ? "active" : ""}
              onClick={() => setActiveTab("connections")}
            >
              🔗 Conexões
            </button>

            <button
              type="button"
              className={activeTab === "shortcuts" ? "active" : ""}
              onClick={() => setActiveTab("shortcuts")}
            >
              ⌨ Atalhos
            </button>

            <button
              type="button"
              className={activeTab === "advanced" ? "active" : ""}
              onClick={() => setActiveTab("advanced")}
            >
              ☷ Avançado
            </button>

            <small>
              O tamanho da janela, a escala da interface e o comportamento de fechamento são preferências suas — não do Windows.
            </small>
          </aside>

          <main>
            {activeTab === "general" ? (
              <>
                <h3>Interface</h3>

                <label>
                  <span>Idioma</span>
                  <CampfireSelect
                    ariaLabel="Idioma"
                    value={languageValue}
                    options={[
                      {
                        value: "system",
                        label: `Usar idioma do Windows (${desktopPreferences?.systemLocale ?? "..."})`,
                      },
                      { value: "pt-BR", label: "Português (Brasil)" },
                      { value: "en-US", label: "English" },
                      { value: "es-ES", label: "Español" },
                      { value: "fr-FR", label: "Français" },
                      { value: "de-DE", label: "Deutsch" },
                      { value: "it-IT", label: "Italiano" },
                    ]}
                    onChange={(value) =>
                      void updateDesktop({
                        language: value as CampfireLanguagePreference,
                      })
                    }
                  />
                  <small>
                    A troca é aplicada imediatamente. Se algum texto técnico ainda não tiver tradução, o Campfire mantém o texto original em vez de exibir uma chave quebrada.
                  </small>
                </label>

                <div className="campfireScaleSetting">
                  <div className="campfireScaleHeader">
                    <span>Tamanho da interface</span>
                    <strong>{uiScalePercent}%</strong>
                  </div>

                  <div className="campfireScaleControls">
                    <button
                      type="button"
                      aria-label="Diminuir interface"
                      disabled={uiScalePercent <= 80}
                      onClick={() =>
                        void updateDesktop({
                          uiScale: Math.max(0.8, (uiScalePercent - 5) / 100),
                        })
                      }
                    >
                      −
                    </button>

                    <input
                      type="range"
                      min="80"
                      max="150"
                      step="5"
                      value={uiScalePercent}
                      onChange={(event) =>
                        void updateDesktop({
                          uiScale: Number(event.target.value) / 100,
                        })
                      }
                    />

                    <button
                      type="button"
                      aria-label="Aumentar interface"
                      disabled={uiScalePercent >= 150}
                      onClick={() =>
                        void updateDesktop({
                          uiScale: Math.min(1.5, (uiScalePercent + 5) / 100),
                        })
                      }
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="campfireScaleReset"
                      onClick={() => void updateDesktop({ uiScale: 1 })}
                    >
                      Restaurar 100%
                    </button>
                  </div>

                  <small>
                    Ajuste entre 80% e 150%, independentemente da escala configurada no Windows. O tamanho e a posição da janela também são lembrados automaticamente.
                  </small>
                </div>

                <label>
                  <span>Ao fechar o Campfire</span>
                  <CampfireSelect
                    ariaLabel="Ao fechar o Campfire"
                    value={closeBehaviorValue}
                    options={[
                      { value: "ask", label: "Perguntar sempre" },
                      { value: "tray", label: "Minimizar para a bandeja" },
                      { value: "quit", label: "Fechar completamente" },
                      { value: "logout", label: "Sair da conta e manter aberto" },
                    ]}
                    onChange={(value) =>
                      void updateDesktop({
                        closeBehavior: value as CampfireCloseBehavior,
                      })
                    }
                  />
                  <small>
                    “Perguntar sempre” restaura o diálogo engraçado do X caso você tenha marcado “Lembrar minha escolha”.
                  </small>
                </label>

                <div className="campfireSettingsInfo">
                  <strong>Janela do seu jeito</strong>
                  <span>
                    Você pode redimensionar livremente o Campfire. A próxima abertura restaura a posição, o tamanho e o estado maximizado quando possível.
                  </span>
                </div>
              </>
            ) : activeTab === "notifications" ? (
              <section className="campfireSettingsVisualPanel campfireSettingsUtilityPanel">
                <div className="campfireSettingsPanelHeading"><div><span className="campfireSettingsPanelIcon">🔔</span><div><h3>Notificações</h3><p>Controles persistentes, ligados aos avisos reais do Campfire.</p></div></div></div>
                <label className="campfireSettingsToggleRow">
                  <span><strong>Notificações do sistema</strong><small>Mostra mensagens fora da janela quando a permissão do sistema estiver concedida.</small></span>
                  <input type="checkbox" checked={appPreferences.systemNotifications} onChange={(event) => event.target.checked ? void enableSystemNotifications() : updateAppPreference("systemNotifications", false)} />
                </label>
                <label className="campfireSettingsToggleRow">
                  <span><strong>Sons do app</strong><small>Ativa sons de mensagens, notificações e o efeito de 2 s ao apagar a fogueira.</small></span>
                  <input type="checkbox" checked={appPreferences.notificationSound} onChange={(event) => updateAppPreference("notificationSound", event.target.checked)} />
                </label>
                <button type="button" className="campfireSettingsActionButton" onClick={() => void enableSystemNotifications()}>Solicitar/verificar permissão do sistema</button>
              </section>
            ) : activeTab === "privacy" ? (
              <section className="campfireSettingsVisualPanel campfireSettingsUtilityPanel">
                <div className="campfireSettingsPanelHeading"><div><span className="campfireSettingsPanelIcon">🔒</span><div><h3>Privacidade</h3><p>Preferências aplicadas ao comportamento real do aplicativo.</p></div></div></div>
                <label className="campfireSettingsToggleRow">
                  <span><strong>Confirmar links externos</strong><small>Pede sua confirmação antes de abrir um endereço fora do Campfire.</small></span>
                  <input type="checkbox" checked={appPreferences.confirmExternalLinks} onChange={(event) => updateAppPreference("confirmExternalLinks", event.target.checked)} />
                </label>
                <div className="campfireSettingsInfo"><strong>Privacidade por Campfire</strong><span>Private, Friends e Invite Link continuam sendo regras da própria sala e são validadas pelo backend.</span></div>
              </section>
            ) : activeTab === "connections" ? (
              <section className="campfireSettingsVisualPanel campfireSettingsUtilityPanel">
                <div className="campfireSettingsPanelHeading"><div><span className="campfireSettingsPanelIcon">🔗</span><div><h3>Conexões</h3><p>Teste os serviços em vez de apenas exibir um rótulo.</p></div></div></div>
                <div className="campfireSettingsActionGrid">
                  <button type="button" className="campfireSettingsActionButton" disabled={connectionTesting} onClick={() => void testSupabaseConnection()}>{connectionTesting ? "Testando…" : "Testar Supabase"}</button>
                  <button type="button" className="campfireSettingsActionButton" onClick={() => void copyConnectionDiagnostic()}>Copiar diagnóstico</button>
                </div>
                <div className="campfireSettingsInfo"><strong>Conta atual</strong><span>A sessão, o estado online e a resposta do backend são consultados de verdade por estes controles.</span></div>
              </section>
            ) : activeTab === "shortcuts" ? (
              <section className="campfireSettingsVisualPanel campfireSettingsUtilityPanel">
                <div className="campfireSettingsPanelHeading"><div><span className="campfireSettingsPanelIcon">⌨</span><div><h3>Atalhos</h3><p>Teclas usadas durante chamadas.</p></div></div></div>
                <div className="campfirePushToTalkSettings">
                  <div><span>Push-to-Talk</span><strong>{formatCampfirePushToTalkBinding(voiceInputSettings.binding)}</strong></div>
                  <div className="campfirePushToTalkActions">
                    <button type="button" className={recordingPushToTalk ? "active" : ""} onClick={() => setRecordingPushToTalk(true)}>{recordingPushToTalk ? "Pressione uma tecla…" : "Gravar tecla"}</button>
                    {voiceInputSettings.binding ? <button type="button" onClick={clearPushToTalkBinding}>Remover</button> : null}
                  </div>
                  <small>O atalho gravado é usado quando o modo Push-to-Talk estiver selecionado em Voz e vídeo.</small>
                </div>
              </section>
            ) : activeTab === "advanced" ? (
              <section className="campfireSettingsVisualPanel campfireSettingsUtilityPanel">
                <div className="campfireSettingsPanelHeading"><div><span className="campfireSettingsPanelIcon">☷</span><div><h3>Avançado</h3><p>Ações reais de recuperação da interface.</p></div></div></div>
                <div className="campfireSettingsInfo"><strong>Escala da interface</strong><span>Atual: {uiScalePercent}%. O ajuste completo continua disponível em Interface e idioma.</span></div>
                <div className="campfireSettingsInfo"><strong>Fechamento</strong><span>Comportamento atual: {closeBehaviorValue}.</span></div>
                <div className="campfireSettingsActionGrid">
                  <button type="button" className="campfireSettingsActionButton" onClick={resetLayoutNow}>Redefinir layout</button>
                  <button type="button" className="campfireSettingsActionButton danger" onClick={() => window.location.reload()}>Recarregar Campfire</button>
                </div>
              </section>
            ) : (
              <>
                <h3>Dispositivos</h3>

                <label>
                  <span>Microfone</span>
                  <CampfireSelect
                    ariaLabel="Microfone"
                    value={settings.audioInputId}
                    options={[
                      { value: "", label: "Padrão do sistema" },
                      ...microphones.map((device, index) => ({
                        value: device.deviceId,
                        label: deviceLabel(device, index, "Microfone"),
                      })),
                    ]}
                    onChange={(value) =>
                      updateSetting(
                        "audioInputId",
                        value
                      )
                    }
                  />
                </label>

                <section className="campfireVoiceInputSettings">
                  <label>
                    <span>Modo de entrada</span>
                    <CampfireSelect
                      ariaLabel="Modo de entrada de voz"
                      value={voiceInputSettings.mode}
                      options={[
                        { value: "voice-activity", label: "Atividade de voz" },
                        { value: "push-to-talk", label: "Push-to-Talk" },
                      ]}
                      onChange={(value) =>
                        updateVoiceInputMode(value as CampfireVoiceInputMode)
                      }
                    />
                  </label>

                  {voiceInputSettings.mode === "push-to-talk" ? (
                    <div className="campfirePushToTalkSettings">
                      <div>
                        <span>Tecla gravada</span>
                        <strong>{formatCampfirePushToTalkBinding(voiceInputSettings.binding)}</strong>
                      </div>
                      <div className="campfirePushToTalkActions">
                        <button
                          type="button"
                          className={recordingPushToTalk ? "active" : ""}
                          onClick={() => setRecordingPushToTalk(true)}
                        >
                          {recordingPushToTalk ? "Pressione uma tecla…" : "Gravar tecla"}
                        </button>
                        {voiceInputSettings.binding ? (
                          <button type="button" onClick={clearPushToTalkBinding}>
                            Remover
                          </button>
                        ) : null}
                      </div>
                      <small>
                        Push-to-Talk só transmite enquanto a tecla gravada estiver pressionada. Sem uma tecla gravada, o microfone permanece silenciado.
                      </small>
                    </div>
                  ) : (
                    <small className="campfireVoiceInputHint">
                      Atividade de voz é o padrão: o microfone segue seus controles de mute e o processamento Voice Pro.
                    </small>
                  )}
                </section>

                <section className="campfireVoiceProSettings">
                  <div className="campfireVoiceProHeading">
                    <div>
                      <strong>Campfire Voice Pro</strong>
                      <span>Processamento local em 48 kHz</span>
                    </div>
                    <span className="campfireVoiceProPrivacy">🔒 Local</span>
                  </div>

                  <label>
                    <span>Perfil de voz</span>
                    <CampfireSelect
                      ariaLabel="Perfil de voz"
                      value={settings.voiceProfile}
                      options={[
                        { value: "clean", label: "Voz limpa" },
                        { value: "strong", label: "Supressão forte" },
                        { value: "studio", label: "Studio / Hi-Fi" },
                      ]}
                      onChange={(value) =>
                        updateSetting(
                          "voiceProfile",
                          value as CampfireVoiceProfile
                        )
                      }
                    />
                    <small>
                      {settings.voiceProfile === "strong"
                        ? "RNNoise/WASM local reforça a remoção de ventilador, teclado e ruído constante."
                        : settings.voiceProfile === "studio"
                          ? "Preserva música e estéreo com processamento mínimo; use fones para evitar eco."
                          : "Perfil padrão para fala: eco, ruído e ganho automático quando suportados."}
                    </small>
                  </label>

                  <div className="campfireVoiceProToggles">
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.echoCancellation}
                        disabled={settings.voiceProfile === "studio"}
                        onChange={(event) =>
                          updateSetting("echoCancellation", event.target.checked)
                        }
                      />
                      <span>Cancelamento de eco</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.nativeNoiseSuppression}
                        disabled={settings.voiceProfile === "studio"}
                        onChange={(event) =>
                          updateSetting("nativeNoiseSuppression", event.target.checked)
                        }
                      />
                      <span>Supressão nativa de ruído</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.autoGainControl}
                        disabled={settings.voiceProfile === "studio"}
                        onChange={(event) =>
                          updateSetting("autoGainControl", event.target.checked)
                        }
                      />
                      <span>Ganho automático</span>
                    </label>
                  </div>

                  <label>
                    <span>Gate / expansor</span>
                    <CampfireSelect
                      ariaLabel="Gate / expansor"
                      value={settings.gateMode}
                      disabled={settings.voiceProfile === "studio"}
                      options={[
                        { value: "auto", label: "Automático" },
                        { value: "manual", label: "Manual" },
                        { value: "off", label: "Desligado" },
                      ]}
                      onChange={(value) =>
                        updateSetting(
                          "gateMode",
                          value as CampfireGateMode
                        )
                      }
                    />
                  </label>

                  {settings.gateMode === "manual" &&
                    settings.voiceProfile !== "studio" && (
                      <label>
                        <span>
                          Sensibilidade
                          <b>{settings.gateSensitivity}%</b>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={settings.gateSensitivity}
                          onChange={(event) =>
                            updateSetting(
                              "gateSensitivity",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                    )}
                </section>

                <label>
                  <span>Webcam</span>
                  <CampfireSelect
                    ariaLabel="Webcam"
                    value={settings.videoInputId}
                    options={[
                      { value: "", label: "Padrão do sistema" },
                      ...cameras.map((device, index) => ({
                        value: device.deviceId,
                        label: deviceLabel(device, index, "Webcam"),
                      })),
                    ]}
                    onChange={(value) =>
                      updateSetting(
                        "videoInputId",
                        value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Qualidade da webcam</span>
                  <CampfireSelect
                    ariaLabel="Qualidade da webcam"
                    value={settings.videoQuality}
                    options={[
                      { value: "auto", label: "Auto — adaptar à rede e à tela" },
                      { value: "economy", label: "Econômico — até 480p" },
                      { value: "hd", label: "HD — alvo 720p30" },
                      { value: "full-hd", label: "Full HD — alvo 1080p" },
                    ]}
                    onChange={(value) =>
                      updateSetting(
                        "videoQuality",
                        value as CampfireVideoQuality
                      )
                    }
                  />
                  <small>
                    O Campfire solicita esse perfil; a resolução real depende da webcam, do encoder e da conexão.
                  </small>
                </label>

                <label>
                  <span>Saída de áudio</span>
                  <CampfireSelect
                    ariaLabel="Saída de áudio"
                    value={settings.audioOutputId}
                    options={[
                      { value: "", label: "Padrão do sistema" },
                      ...speakers.map((device, index) => ({
                        value: device.deviceId,
                        label: deviceLabel(device, index, "Saída"),
                      })),
                    ]}
                    onChange={(value) =>
                      updateSetting(
                        "audioOutputId",
                        value
                      )
                    }
                  />

                  <small>
                    A seleção de saída é aplicada quando o Chromium/Electron disponibiliza troca de dispositivo para Web Audio.
                  </small>
                </label>

                <div className="campfireDeviceTest">
                  <div className="campfireDevicePreview">
                    <video
                      ref={previewRef}
                      autoPlay
                      muted
                      playsInline
                    />

                    {!testing && (
                      <span>📹 Prévia da webcam</span>
                    )}
                  </div>

                  <div className="campfireMicTest">
                    <strong>Teste do microfone</strong>
                    <small className="campfireMicTestIntro">Funciona mesmo fora de uma call e nunca publica o teste no LiveKit.</small>

                    <div className="campfireMicTestModes" role="tablist" aria-label="Modo do teste do microfone">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={microphoneTestMode === "live"}
                        className={microphoneTestMode === "live" ? "active" : ""}
                        onClick={() => setMicrophoneTestMode("live")}
                      >
                        Monitorar ao vivo
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={microphoneTestMode === "record"}
                        className={microphoneTestMode === "record" ? "active" : ""}
                        onClick={() => setMicrophoneTestMode("record")}
                      >
                        Gravar e reproduzir
                      </button>
                    </div>

                    <div className="campfireMicMeterRow">
                      <span>Entrada original</span>
                      <div><i style={{ width: `${microphoneTest.originalLevel}%` }} /></div>
                      <b>{microphoneTest.originalLevel}%</b>
                    </div>

                    <div className="campfireMicMeterRow processed">
                      <span>Voz processada</span>
                      <div><i style={{ width: `${microphoneTest.processedLevel}%` }} /></div>
                      <b>{microphoneTest.processedLevel}%</b>
                    </div>

                    <label className="campfireMicVolumeControl">
                      <span>Volume enviado aos outros <b>{micTestOutgoingVolume}%</b></span>
                      <input
                        type="range" min="0" max="200" step="5"
                        value={micTestOutgoingVolume}
                        onChange={(event) => {
                          const value = clampTestVolume(Number(event.target.value));
                          setMicTestOutgoingVolume(value);
                          saveTestVolume(OUTGOING_VOLUME_KEY, value);
                        }}
                      />
                    </label>

                    <label className="campfireMicVolumeControl">
                      <span>Volume do retorno <b>{micTestMonitorVolume}%</b></span>
                      <input
                        type="range" min="0" max="200" step="5"
                        value={micTestMonitorVolume}
                        onChange={(event) => {
                          const value = clampTestVolume(Number(event.target.value));
                          setMicTestMonitorVolume(value);
                          saveTestVolume(MONITOR_VOLUME_KEY, value);
                        }}
                      />
                    </label>

                    {microphoneTestMode === "live" ? (
                      <div className="campfireMicModePanel">
                        <label className="campfireMicListenToggle">
                          <input
                            type="checkbox"
                            checked={microphoneTest.listening}
                            onChange={(event) =>
                              microphoneTest.setListening(event.target.checked)
                            }
                          />
                          Ouvir meu microfone
                        </label>

                        <div className="campfireMicCompare" aria-label="Comparar áudio">
                          <button
                            type="button"
                            className={microphoneTest.monitorSource === "original" ? "active" : ""}
                            onClick={() => microphoneTest.setMonitorSource("original")}
                          >
                            Original
                          </button>
                          <button
                            type="button"
                            className={microphoneTest.monitorSource === "processed" ? "active" : ""}
                            onClick={() => microphoneTest.setMonitorSource("processed")}
                          >
                            Processado
                          </button>
                        </div>

                        <div className="campfireMicModeActions">
                          <button type="button" className="primary" onClick={() => void startLiveMicrophoneMonitor()}>
                            Monitorar ao vivo
                          </button>
                          {microphoneTest.testing && microphoneTest.listening && (
                            <button type="button" onClick={() => void stopLiveMicrophoneMonitor()}>Parar monitoramento</button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="campfireMicModePanel">
                        <div className="campfireMicRecordingStatus" role="status">
                          <span className={micRecording ? "recording" : ""} />
                          <strong>{micRecording ? "Gravando" : micRecordingUrl ? "Gravação pronta" : "Pronto para gravar"}</strong>
                          <b>{(micRecordingElapsed / 1000).toFixed(1)} / 15.0 s</b>
                        </div>
                        <div className="campfireMicRecordingProgress"><i style={{ width: `${Math.min(100, (micRecordingElapsed / MAX_MIC_RECORDING_MS) * 100)}%` }} /></div>
                        <div className="campfireMicModeActions">
                          {!micRecording ? (
                            <button type="button" className="primary" onClick={() => void startMicrophoneRecording()}>Iniciar gravação</button>
                          ) : (
                            <button type="button" className="danger" onClick={() => stopMicrophoneRecording(false)}>Parar gravação</button>
                          )}
                          <button type="button" disabled={!micRecordingUrl || micRecording} onClick={playMicrophoneRecording}>Reproduzir teste</button>
                        </div>
                        <audio ref={micPlaybackRef} src={micRecordingUrl || undefined} preload="metadata" />
                        <small>Gravação local manual, com encerramento automático em 15 segundos. O arquivo temporário não é enviado para a call.</small>
                      </div>
                    )}

                    {settings.voiceProfile === "strong" && microphoneTest.testing && (
                      <small>
                        {microphoneTest.rnnoiseActive
                          ? "RNNoise ativo no teste local."
                          : "Supressão forte indisponível. Usando Voz limpa."}
                      </small>
                    )}
                  </div>
                </div>

                <div className="campfireSettingsActions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() =>
                      void testDevices()
                    }
                  >
                    {testing
                      ? "↻ Reiniciar teste"
                      : "🎙📹 Permitir e testar"}
                  </button>

                  {testing && (
                    <button
                      type="button"
                      onClick={stopTest}
                    >
                      Parar teste
                    </button>
                  )}
                </div>

                {(message || microphoneTest.error) && (
                  <div className="campfireSettingsMessage">
                    {microphoneTest.error || message}
                  </div>
                )}

                <p className="campfireSettingsHint">
                  Alterações de microfone são aplicadas automaticamente à voz ativa. Webcam e perfis que exigirem reinicialização avisarão quando necessário.
                </p>

                {campfireId && isCampfireOwner && (
                  <CampfireVoiceChannelManager moderation={moderation} isOwner={isCampfireOwner} />
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

export default CampfireSettingsModal;
