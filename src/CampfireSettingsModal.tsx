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
import { useCampfireMicrophoneTest } from "./useCampfireMicrophoneTest";
import CampfireSelect from "./CampfireSelect";

import CampfireVoiceChannelManager from "./CampfireVoiceChannelManager";
import { useCampfireModeration } from "./useCampfireModeration";
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
  onClose: () => void;
  campfireId?: string | null;
  isCampfireOwner?: boolean;
};

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

  const [activeTab, setActiveTab] =
    useState<"general" | "media">("general");

  const [desktopPreferences, setDesktopPreferences] =
    useState<CampfireDesktopPreferences | null>(null);

  const [devices, setDevices] =
    useState<MediaDeviceInfo[]>([]);

  const [message, setMessage] =
    useState("");

  const [testing, setTesting] =
    useState(false);

  const previewRef =
    useRef<HTMLVideoElement | null>(null);

  const testStreamRef =
    useRef<MediaStream | null>(null);

  const microphoneTest = useCampfireMicrophoneTest(settings);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }

    try {
      const list =
        await navigator.mediaDevices.enumerateDevices();

      setDevices(list);
    } catch (deviceError) {
      console.warn(
        "Não foi possível enumerar dispositivos:",
        deviceError
      );
    }
  }

  async function stopTest() {
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
      const hasKnownMicrophone =
        devices.some(
          (device) =>
            device.kind === "audioinput"
        );

      const hasKnownCamera =
        devices.some(
          (device) =>
            device.kind === "videoinput"
        );

      if (hasKnownMicrophone || devices.length === 0) {
        await microphoneTest.start();
      }

      if (hasKnownCamera) {
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
      }

      await refreshDevices();
      saveCampfireMediaSettings(settings);
      setMessage(
        "Teste local ativo. O áudio processado usa a mesma cadeia do Voice Pro enviada à voz."
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

  useEffect(() => {
    if (!open) {
      void stopTest();
      return;
    }

    setSettings(
      loadCampfireMediaSettings()
    );
    void refreshDevices();

    return () => {
      void stopTest();
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
                  ? "Aparência e idioma"
                  : "Voz e vídeo"}
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
              🖥 Aparência e idioma
            </button>

            <button
              type="button"
              className={activeTab === "media" ? "active" : ""}
              onClick={() => setActiveTab("media")}
            >
              🎙 Voz e vídeo
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
