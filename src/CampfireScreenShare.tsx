import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getCurrentWindow,
  setDisplayCapturePreference,
} from "./desktop";

import {
  useCampfireWebRTC,
} from "./useCampfireWebRTC";

import "./CampfireScreenShare.css";


type Props = {
  campfireId:
    string;

  onLiveChange?: (
    live:
      boolean
  ) => void;
};


type CaptureMode =
  | "monitor"
  | "window";


type CaptureQuality =
  | "720p"
  | "1080p"
  | "native";


type CaptureFps =
  | 30
  | 60;


type StreamInfo = {
  width:
    number | null;

  height:
    number | null;

  frameRate:
    number | null;

  hasAudio:
    boolean;

  displaySurface:
    string | null;
};


/*
 * ============================================================
 * CAPTURE CONTROLLER
 *
 * Nem todas as versões do WebView expõem
 * essa interface nas tipagens TypeScript.
 * Por isso fazemos detecção em runtime.
 * ============================================================
 */

type CampfireCaptureController = {
  setFocusBehavior?: (
    behavior:
      string
  ) => void;
};


type CampfireCaptureControllerConstructor =
  new () =>
    CampfireCaptureController;


function createCaptureController():
  CampfireCaptureController | null {
  const runtime =
    globalThis as typeof globalThis & {
      CaptureController?:
        CampfireCaptureControllerConstructor;
    };


  if (
    typeof runtime
      .CaptureController !==
    "function"
  ) {
    return null;
  }


  try {
    return new runtime
      .CaptureController();
  } catch {
    return null;
  }
}


/*
 * ============================================================
 * ERROS
 * ============================================================
 */

function captureErrorMessage(
  error:
    unknown
): string {
  if (
    error instanceof
      DOMException
  ) {
    switch (
      error.name
    ) {
      case "NotAllowedError":
        return (
          "O compartilhamento foi cancelado ou não foi autorizado."
        );

      case "NotFoundError":
        return (
          "Nenhuma tela ou janela disponível foi encontrada."
        );

      case "NotReadableError":
        return (
          "O Windows não conseguiu capturar essa tela ou janela."
        );

      case "AbortError":
        return (
          "A captura foi cancelada."
        );

      case "InvalidStateError":
        return (
          "O compartilhamento precisa ser iniciado diretamente pelo botão."
        );

      case "OverconstrainedError":
        return (
          "A origem selecionada não suporta as configurações escolhidas."
        );

      default:
        return (
          `${error.name}: ${error.message}`
        );
    }
  }


  if (
    error instanceof Error
  ) {
    return error.message;
  }


  return (
    "Não foi possível iniciar o compartilhamento."
  );
}


/*
 * ============================================================
 * HOST
 * ============================================================
 */

function hostName(
  _displayName:
    string | null,

  username:
    string | null
) {
  return username
    ? `@${username}`
    : "Usuário";
}


/*
 * ============================================================
 * CONSTRAINTS
 * ============================================================
 */

function qualityConstraints(
  quality:
    CaptureQuality,

  fps:
    CaptureFps
): MediaTrackConstraints {
  if (
    quality ===
    "720p"
  ) {
    return {
      width: {
        ideal:
          1280,
      },

      height: {
        ideal:
          720,
      },

      frameRate: {
        ideal:
          fps,

        max:
          fps,
      },
    };
  }


  if (
    quality ===
    "1080p"
  ) {
    return {
      width: {
        ideal:
          1920,
      },

      height: {
        ideal:
          1080,
      },

      frameRate: {
        ideal:
          fps,

        max:
          fps,
      },
    };
  }


  return {
    frameRate: {
      ideal:
        fps,

      max:
        fps,
    },
  };
}


/*
 * ============================================================
 * DISPLAY OPTIONS
 * ============================================================
 */

function buildDisplayOptions(
  mode:
    CaptureMode,

  quality:
    CaptureQuality,

  fps:
    CaptureFps,

  shareAudio:
    boolean,

  controller:
    CampfireCaptureController | null
) {
  /*
   * Usamos Record porque algumas propriedades
   * recentes de Screen Capture podem ainda
   * não existir no lib.dom.d.ts instalado.
   */

  const videoConstraints =
    qualityConstraints(
      quality,
      fps
    ) as MediaTrackConstraints &
      Record<
        string,
        unknown
      >;


  /*
   * Isso é uma PREFERÊNCIA.
   *
   * Depois verificamos getSettings()
   * para saber o que realmente foi
   * escolhido.
   */

  videoConstraints
    .displaySurface =
      mode ===
      "window"
        ? "window"
        : "monitor";


  const options:
    Record<
      string,
      unknown
    > = {
      video:
        videoConstraints,

      audio:
        shareAudio,

      /*
       * Evita capturar o próprio
       * Campfire quando possível.
       */
      selfBrowserSurface:
        "exclude",

      /*
       * Dá preferência a áudio
       * quando solicitado.
       */
      audioSelection:
        shareAudio
          ? "preferred"
          : undefined,
    };


  if (
    mode ===
    "window"
  ) {
    /*
     * Pedimos para não mostrar
     * monitores entre as opções.
     *
     * O WebView pode ignorar.
     */

    options
      .monitorTypeSurfaces =
        "exclude";

    options
      .windowAudio =
        shareAudio
          ? "system"
          : "exclude";
  } else {
    options
      .monitorTypeSurfaces =
        "include";

    options
      .systemAudio =
        shareAudio
          ? "include"
          : "exclude";
  }


  if (
    controller
  ) {
    options.controller =
      controller;
  }


  return options;
}


/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

function CampfireScreenShare({
  campfireId,
  onLiveChange,
}: Props) {
  const rtc =
    useCampfireWebRTC(
      campfireId
    );


  const localVideoRef =
    useRef<
      HTMLVideoElement | null
    >(
      null
    );


  const remoteVideoRef =
    useRef<
      HTMLVideoElement | null
    >(
      null
    );


  const localStreamRef =
    useRef<
      MediaStream | null
    >(
      null
    );


  const [
    captureMode,
    setCaptureMode,
  ] =
    useState<CaptureMode>(
      "monitor"
    );


  const [
    quality,
    setQuality,
  ] =
    useState<CaptureQuality>(
      "1080p"
    );


  const [
    fps,
    setFps,
  ] =
    useState<CaptureFps>(
      30
    );


  const [
    shareAudio,
    setShareAudio,
  ] =
    useState(
      true
    );


  const [
    localSharing,
    setLocalSharing,
  ] =
    useState(
      false
    );


  const [
    starting,
    setStarting,
  ] =
    useState(
      false
    );


  const [
    previewReady,
    setPreviewReady,
  ] =
    useState(
      false
    );


  const [
    localError,
    setLocalError,
  ] =
    useState("");


  const [
    streamInfo,
    setStreamInfo,
  ] =
    useState<
      StreamInfo | null
    >(
      null
    );


  const captureSupported =
    Boolean(
      navigator
        .mediaDevices
        ?.getDisplayMedia
    );


  const isHost =
    Boolean(
      rtc.activeSession &&
      rtc.currentUserId &&
      rtc.activeSession.hostId ===
        rtc.currentUserId
    );


  /*
   * =========================================================
   * LIVE DA ABA
   * =========================================================
   */

  useEffect(() => {
    onLiveChange?.(
      Boolean(
        rtc.activeSession
      )
    );
  }, [
    rtc.activeSession,
    onLiveChange,
  ]);


  /*
   * =========================================================
   * PREVIEW LOCAL
   * =========================================================
   */

  useEffect(() => {
    if (
      !localSharing
    ) {
      return;
    }


    const video =
      localVideoRef.current;


    const stream =
      localStreamRef.current;


    if (
      !video ||
      !stream
    ) {
      return;
    }


    video.srcObject =
      stream;


    void video
      .play()
      .catch(
        (
          playError
        ) => {
          console.warn(
            "Preview local:",
            playError
          );
        }
      );


    return () => {
      if (
        video.srcObject ===
        stream
      ) {
        video.pause();

        video.srcObject =
          null;
      }
    };
  }, [
    localSharing,
  ]);


  /*
   * =========================================================
   * STREAM REMOTO
   * =========================================================
   */

  useEffect(() => {
    const video =
      remoteVideoRef.current;


    if (
      !video ||
      !rtc.remoteStream
    ) {
      return;
    }


    video.srcObject =
      rtc.remoteStream;


    void video
      .play()
      .catch(
        (
          playError
        ) => {
          console.warn(
            "Playback remoto:",
            playError
          );
        }
      );


    return () => {
      if (
        video.srcObject ===
        rtc.remoteStream
      ) {
        video.pause();

        video.srcObject =
          null;
      }
    };
  }, [
    rtc.remoteStream,
  ]);


  /*
   * =========================================================
   * PARAR CAPTURA LOCAL
   * =========================================================
   */

  const stopLocalCapture =
    useCallback(
      () => {
        const stream =
          localStreamRef.current;


        if (
          stream
        ) {
          for (
            const track
            of stream.getTracks()
          ) {
            track.stop();
          }
        }


        localStreamRef.current =
          null;


        if (
          localVideoRef.current
        ) {
          localVideoRef.current
            .pause();

          localVideoRef.current
            .srcObject =
            null;
        }


        setLocalSharing(
          false
        );

        setPreviewReady(
          false
        );

        setStreamInfo(
          null
        );
      },
      []
    );


  /*
   * =========================================================
   * FOCAR CAMPFIRE
   * =========================================================
   */

  async function focusCampfire() {
    /*
     * Pequeno atraso para deixar o
     * seletor nativo desaparecer.
     */

    await new Promise<void>(
      (
        resolve
      ) => {
        window.setTimeout(
          resolve,
          180
        );
      }
    );


    try {
      await getCurrentWindow()
        .show();


      await getCurrentWindow()
        .unminimize();


      await getCurrentWindow()
        .setFocus();
    } catch (
      focusError
    ) {
      console.warn(
        "Não foi possível trazer o Campfire para frente:",
        focusError
      );
    }
  }


  /*
   * =========================================================
   * INICIAR TRANSMISSÃO
   * =========================================================
   */

  async function startSharing() {
    if (
      starting ||
      localSharing
    ) {
      return;
    }


    setLocalError("");


    if (
      !navigator.mediaDevices
        ?.getDisplayMedia
    ) {
      setLocalError(
        "Este runtime Electron não disponibiliza captura de tela."
      );

      return;
    }


    if (
      !rtc.canShareScreen
    ) {
      setLocalError(
        "Você não possui permissão para compartilhar a tela nesta Campfire."
      );

      return;
    }


    if (
      rtc.activeSession
    ) {
      setLocalError(
        "Já existe uma transmissão ativa nesta Campfire."
      );

      return;
    }


    setStarting(
      true
    );


    let stream:
      MediaStream | null =
      null;


    try {
      /*
       * -----------------------------------------------
       * CAPTURE CONTROLLER
       * -----------------------------------------------
       */

      const controller =
        createCaptureController();


      if (
        controller
          ?.setFocusBehavior
      ) {
        try {
          /*
           * Queremos que, terminada
           * a seleção, o Campfire
           * volte para frente.
           */

          controller
            .setFocusBehavior(
              "focus-capturing-application"
            );
        } catch (
          controllerError
        ) {
          console.warn(
            "CaptureController não aceitou controle de foco:",
            controllerError
          );
        }
      }


      /*
       * -----------------------------------------------
       * OPÇÕES
       * -----------------------------------------------
       */

      const options =
        buildDisplayOptions(
          captureMode,
          quality,
          fps,
          shareAudio,
          controller
        );


      console.log(
        "🔥 Modo solicitado:",
        captureMode
      );


      console.log(
        "🔥 Opções getDisplayMedia:",
        options
      );


      /*
       * -----------------------------------------------
       * CAPTURA
       * -----------------------------------------------
       */

      await setDisplayCapturePreference(
        captureMode
      );

      stream =
        await navigator
          .mediaDevices
          .getDisplayMedia(
            options as
              DisplayMediaStreamOptions
          );


      const videoTrack =
        stream
          .getVideoTracks()[0];


      if (
        !videoTrack
      ) {
        throw new Error(
          "A captura não retornou uma faixa de vídeo."
        );
      }


      const settings =
        videoTrack
          .getSettings();


      const actualSurface =
        typeof settings
          .displaySurface ===
        "string"
          ? settings
              .displaySurface
          : null;


      console.log(
        "🔥 Origem realmente escolhida:",
        actualSurface
      );


      /*
       * -----------------------------------------------
       * VALIDAR MODO JANELA
       * -----------------------------------------------
       *
       * O browser pode ignorar nosso
       * pedido e continuar mostrando
       * Monitor.
       *
       * Nesse caso, não fingimos que
       * o compartilhamento de aplicação
       * funcionou.
       */

      if (
        captureMode ===
          "window" &&
        actualSurface ===
          "monitor"
      ) {
        for (
          const track
          of stream.getTracks()
        ) {
          track.stop();
        }


        stream =
          null;


        await focusCampfire();


        setLocalError(
          "Você escolheu um monitor inteiro. Para o modo Aplicativo / janela, selecione uma janela ou programa no seletor."
        );


        return;
      }


      /*
       * -----------------------------------------------
       * VALIDAR MODO MONITOR
       * -----------------------------------------------
       */

      if (
        captureMode ===
          "monitor" &&
        (
          actualSurface ===
            "window" ||
          actualSurface ===
            "browser"
        )
      ) {
        for (
          const track
          of stream.getTracks()
        ) {
          track.stop();
        }


        stream =
          null;


        await focusCampfire();


        setLocalError(
          "Você escolheu uma janela. Para compartilhar a tela inteira, escolha um monitor no seletor."
        );


        return;
      }


      /*
       * -----------------------------------------------
       * GUARDAR STREAM
       * -----------------------------------------------
       */

      localStreamRef.current =
        stream;


      setStreamInfo({
        width:
          typeof settings.width ===
          "number"
            ? settings.width
            : null,

        height:
          typeof settings.height ===
          "number"
            ? settings.height
            : null,

        frameRate:
          typeof settings.frameRate ===
          "number"
            ? settings.frameRate
            : null,

        hasAudio:
          stream
            .getAudioTracks()
            .length >
          0,

        displaySurface:
          actualSurface,
      });


      /*
       * -----------------------------------------------
       * INICIAR WEBRTC
       * -----------------------------------------------
       */

      const result =
        await rtc.startHosting(
          stream,

          captureMode ===
            "window"
            ? "Compartilhamento de aplicativo"
            : "Compartilhamento de tela"
        );


      if (
        !result.ok
      ) {
        throw new Error(
          result.message
        );
      }


      /*
       * -----------------------------------------------
       * PREVIEW
       * -----------------------------------------------
       */

      setLocalSharing(
        true
      );


      setPreviewReady(
        false
      );


      /*
       * -----------------------------------------------
       * ENCERRADO PELO WINDOWS
       * -----------------------------------------------
       */

      videoTrack
        .addEventListener(
          "ended",

          () => {
            void stopSharing();
          },

          {
            once:
              true,
          }
        );


      /*
       * -----------------------------------------------
       * TRAZER CAMPFIRE DE VOLTA
       * -----------------------------------------------
       */

      await focusCampfire();
    } catch (
      startError
    ) {
      console.error(
        "Erro iniciando captura:",
        startError
      );


      if (
        stream
      ) {
        for (
          const track
          of stream.getTracks()
        ) {
          track.stop();
        }
      }


      localStreamRef.current =
        null;


      setLocalError(
        captureErrorMessage(
          startError
        )
      );


      stopLocalCapture();


      await focusCampfire();
    } finally {
      setStarting(
        false
      );
    }
  }


  /*
   * =========================================================
   * ENCERRAR HOST
   * =========================================================
   */

  async function stopSharing() {
    setLocalError("");


    if (
      isHost
    ) {
      const result =
        await rtc
          .stopHosting();


      if (
        !result.ok
      ) {
        setLocalError(
          result.message
        );
      }
    }


    stopLocalCapture();
  }


  /*
   * =========================================================
   * ENTRAR COMO VIEWER
   * =========================================================
   */

  async function joinViewing() {
    setLocalError("");


    const result =
      await rtc
        .joinViewing();


    if (
      !result.ok
    ) {
      setLocalError(
        result.message
      );
    }
  }


  /*
   * =========================================================
   * FULLSCREEN
   * =========================================================
   */

  async function fullscreen(
    video:
      HTMLVideoElement | null
  ) {
    if (
      !video
    ) {
      return;
    }


    try {
      await video
        .requestFullscreen();
    } catch (
      fullscreenError
    ) {
      console.warn(
        "Fullscreen:",
        fullscreenError
      );
    }
  }


  /*
   * =========================================================
   * NOME DA ORIGEM
   * =========================================================
   */

  function sourceText() {
    switch (
      streamInfo
        ?.displaySurface
    ) {
      case "monitor":
        return (
          "Monitor"
        );

      case "window":
        return (
          "Aplicativo / janela"
        );

      case "browser":
        return (
          "Janela do navegador"
        );

      default:
        return captureMode ===
          "window"
          ? "Aplicativo / janela"
          : "Monitor";
    }
  }


  /*
   * =========================================================
   * CLEANUP
   * =========================================================
   */

  useEffect(() => {
    return () => {
      const stream =
        localStreamRef
          .current;


      if (
        stream
      ) {
        for (
          const track
          of stream.getTracks()
        ) {
          track.stop();
        }
      }
    };
  }, []);


  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (
    rtc.loading
  ) {
    return (
      <div className="screenSharePage">

        <div className="screenShareIdle">

          <div className="screenShareIdleIcon">
            🖥️
          </div>

          <h2>
            Preparando transmissão...
          </h2>

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * API INDISPONÍVEL
   * =========================================================
   */

  if (
    !captureSupported
  ) {
    return (
      <div className="screenSharePage">

        <div className="screenShareUnsupported">

          <div>
            ⚠️
          </div>

          <strong>
            Captura de tela indisponível
          </strong>

          <p>
            O Electron não disponibilizou
            a API necessária.
          </p>

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * HOST LIVE
   * =========================================================
   */

  if (
    rtc.activeSession &&
    isHost &&
    localSharing
  ) {
    return (
      <div className="screenSharePage">

        <div className="screenShareLive">

          <div className="screenShareLiveHeader">

            <div className="screenShareLiveIdentity">

              <span className="screenShareLiveDot" />

              <div>

                <strong>
                  🔴 LIVE — Você está transmitindo
                </strong>

                <small>
                  {sourceText()}
                  {" • "}
                  {rtc.viewerCount}
                  {" "}
                  espectador(es)
                </small>

              </div>

            </div>


            <div className="screenShareLiveActions">

              <button
                className="screenPreviewFullscreen"

                onClick={() =>
                  void fullscreen(
                    localVideoRef.current
                  )
                }
              >
                ⛶ Tela cheia
              </button>


              <button
                className="screenShareStopButton"

                onClick={() =>
                  void stopSharing()
                }
              >
                ■ Encerrar
              </button>

            </div>

          </div>


          <div className="screenShareVideoArea">

            <video
              ref={
                localVideoRef
              }

              className="screenShareVideo"

              autoPlay

              playsInline

              muted

              onPlaying={() =>
                setPreviewReady(
                  true
                )
              }

              onLoadedMetadata={() =>
                setPreviewReady(
                  true
                )
              }
            />


            {!previewReady && (
              <div className="screenSharePreparing">
                Preparando preview...
              </div>
            )}


            <div className="screenSharePreviewBadge">
              {streamInfo
                ?.displaySurface ===
                "monitor"
                  ? "MONITOR"
                  : "APLICATIVO"}
            </div>

          </div>


          <div className="screenShareInformation">

            <div>

              <span>
                ORIGEM
              </span>

              <strong>
                {sourceText()}
              </strong>

            </div>


            <div>

              <span>
                RESOLUÇÃO
              </span>

              <strong>
                {streamInfo?.width &&
                streamInfo?.height
                  ? `${streamInfo.width} × ${streamInfo.height}`
                  : "Auto"}
              </strong>

            </div>


            <div>

              <span>
                FPS
              </span>

              <strong>
                {streamInfo?.frameRate
                  ? Math.round(
                      streamInfo.frameRate
                    )
                  : fps}
              </strong>

            </div>


            <div>

              <span>
                ÁUDIO
              </span>

              <strong
                className={
                  streamInfo?.hasAudio
                    ? "screenAudioYes"
                    : ""
                }
              >
                {streamInfo?.hasAudio
                  ? "✓ Capturado"
                  : "Sem áudio"}
              </strong>

            </div>


            <div>

              <span>
                WEBRTC
              </span>

              <strong
                className={
                  rtc.signalingReady
                    ? "screenAudioYes"
                    : ""
                }
              >
                {rtc.signalingReady
                  ? "✓ Online"
                  : "Conectando"}
              </strong>

            </div>

          </div>


          {localError && (
            <div className="screenShareError screenShareErrorLive">
              {localError}
            </div>
          )}

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * SESSÃO ANTIGA DO HOST
   * =========================================================
   */

  if (
    rtc.activeSession &&
    isHost &&
    !localSharing
  ) {
    return (
      <div className="screenSharePage">

        <div className="screenViewerLanding">

          <div className="screenViewerLiveIcon">
            ⚠️
          </div>

          <h2>
            Sua transmissão anterior ainda está LIVE
          </h2>

          <p>
            Isso pode acontecer se o
            Campfire tiver sido fechado
            durante uma transmissão.
          </p>


          <button
            className="screenShareStopButton screenLargeAction"

            onClick={async () => {
              const result =
                await rtc
                  .stopHosting();


              if (
                !result.ok
              ) {
                setLocalError(
                  result.message
                );
              }
            }}
          >
            ■ Encerrar sessão anterior
          </button>


          {localError && (
            <div className="screenShareError">
              {localError}
            </div>
          )}

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * VIEWER
   * =========================================================
   */

  if (
    rtc.activeSession &&
    !isHost
  ) {
    const presenter =
      hostName(
        rtc.activeSession
          .hostDisplayName,

        rtc.activeSession
          .hostUsername
      );


    if (
      rtc.remoteStream
    ) {
      return (
        <div className="screenSharePage">

          <div className="screenShareLive">

            <div className="screenShareLiveHeader">

              <div className="screenShareLiveIdentity">

                <span className="screenShareLiveDot" />

                <div>

                  <strong>
                    🔴 {presenter} está transmitindo
                  </strong>

                  <small>
                    {rtc.activeSession
                      .title ??
                      "Compartilhamento de tela"}
                  </small>

                </div>

              </div>


              <div className="screenShareLiveActions">

                <button
                  className="screenPreviewFullscreen"

                  onClick={() =>
                    void fullscreen(
                      remoteVideoRef.current
                    )
                  }
                >
                  ⛶ Tela cheia
                </button>


                <button
                  className="screenShareStopButton"

                  onClick={() =>
                    void rtc
                      .leaveViewing()
                  }
                >
                  🚪 Sair
                </button>

              </div>

            </div>


            <div className="screenShareVideoArea">

              <video
                ref={
                  remoteVideoRef
                }

                className="screenShareVideo"

                autoPlay

                playsInline
              />


              <div className="screenSharePreviewBadge">
                LIVE
              </div>

            </div>


            <div className="screenShareViewerState">

              WebRTC:
              {" "}

              <strong>
                {rtc.viewerState}
              </strong>

            </div>

          </div>

        </div>
      );
    }


    return (
      <div className="screenSharePage">

        <div className="screenViewerLanding">

          <div className="screenViewerLiveIcon">
            🔴
          </div>


          <div className="screenViewerAvatar">

            {rtc.activeSession
              .hostAvatarUrl ? (
              <img
                src={
                  rtc.activeSession
                    .hostAvatarUrl
                }

                alt=""
              />
            ) : (
              presenter
                .charAt(0)
                .toUpperCase()
            )}

          </div>


          <h2>
            {presenter} está compartilhando
          </h2>


          <p>
            {rtc.activeSession
              .title ??
              "Compartilhamento de tela"}
          </p>


          <div className="screenViewerSignalStatus">

            {rtc.signalingReady
              ? "● Pronto para entrar"
              : "○ Conectando à transmissão..."}

          </div>


          <button
            className="screenShareStartButton"

            disabled={
              !rtc.signalingReady ||
              rtc.viewerState ===
                "waiting" ||
              rtc.viewerState ===
                "connecting"
            }

            onClick={() =>
              void joinViewing()
            }
          >
            {rtc.viewerState ===
              "waiting"
              ? "Aguardando apresentador..."

              : rtc.viewerState ===
                  "connecting"
                ? "Conectando..."

                : "▶ Entrar na exibição"}
          </button>


          {rtc.viewerState ===
            "failed" && (
            <div className="screenShareError">
              Não foi possível estabelecer
              a conexão WebRTC.
            </div>
          )}


          {localError && (
            <div className="screenShareError">
              {localError}
            </div>
          )}

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * SEM LIVE
   * =========================================================
   */

  return (
    <div className="screenSharePage">

      <div className="screenShareIdle screenShareSetup">

        <div className="screenShareIdleIcon">
          🖥️
        </div>


        <h2>
          Compartilhar
        </h2>


        <p>
          Escolha o que deseja transmitir
          para as pessoas da Campfire.
        </p>


        {rtc.canShareScreen ? (
          <>

            {/* =================================================
                TIPO DE CAPTURA
                ================================================= */}

            <div className="screenCaptureModeGrid">

              <button
                type="button"

                className={
                  captureMode ===
                  "monitor"
                    ? "screenCaptureMode active"
                    : "screenCaptureMode"
                }

                onClick={() =>
                  setCaptureMode(
                    "monitor"
                  )
                }
              >

                <span className="screenCaptureModeIcon">
                  🖥️
                </span>

                <strong>
                  Tela inteira
                </strong>

                <small>
                  Compartilha um monitor completo.
                </small>

              </button>


              <button
                type="button"

                className={
                  captureMode ===
                  "window"
                    ? "screenCaptureMode active"
                    : "screenCaptureMode"
                }

                onClick={() =>
                  setCaptureMode(
                    "window"
                  )
                }
              >

                <span className="screenCaptureModeIcon">
                  🪟
                </span>

                <strong>
                  Aplicativo / janela
                </strong>

                <small>
                  Transmite somente o programa selecionado.
                </small>

              </button>

            </div>


            {/* =================================================
                CONFIGURAÇÕES
                ================================================= */}

            <div className="screenCaptureSettings">

              <label>

                <span>
                  Qualidade
                </span>

                <select
                  value={
                    quality
                  }

                  onChange={(
                    event
                  ) =>
                    setQuality(
                      event.target
                        .value as
                        CaptureQuality
                    )
                  }
                >
                  <option value="720p">
                    720p
                  </option>

                  <option value="1080p">
                    1080p
                  </option>

                  <option value="native">
                    Original
                  </option>
                </select>

              </label>


              <label>

                <span>
                  FPS
                </span>

                <select
                  value={
                    fps
                  }

                  onChange={(
                    event
                  ) =>
                    setFps(
                      Number(
                        event.target
                          .value
                      ) as
                        CaptureFps
                    )
                  }
                >
                  <option value="30">
                    30 FPS
                  </option>

                  <option value="60">
                    60 FPS
                  </option>
                </select>

              </label>


              <label className="screenCaptureAudioOption">

                <input
                  type="checkbox"

                  checked={
                    shareAudio
                  }

                  onChange={(
                    event
                  ) =>
                    setShareAudio(
                      event.target
                        .checked
                    )
                  }
                />

                <span>
                  🔊 Compartilhar áudio
                </span>

              </label>

            </div>


            {captureMode ===
              "window" && (
              <div className="screenWindowCaptureTip">

                🪟 No seletor que aparecer,
                escolha o programa ou janela.
                O Campfire voltará para frente
                depois da seleção.

              </div>
            )}


            <button
              className="screenShareStartButton"

              disabled={
                starting
              }

              onClick={() =>
                void startSharing()
              }
            >
              {starting
                ? "Aguardando seleção..."

                : captureMode ===
                    "window"
                  ? "🪟 Selecionar aplicativo"

                  : "🖥️ Selecionar monitor"}
            </button>

          </>
        ) : (
          <div className="screenNoPermission">
            🔒 Somente o dono ou membros
            autorizados podem iniciar
            uma transmissão.
          </div>
        )}


        <div className="screenSharePrivacyNotice">
          🔒 A escolha da janela ou monitor
          continua sendo confirmada pelo sistema.
        </div>


        {(localError ||
          rtc.error) && (
          <div className="screenShareError">

            {localError ||
              rtc.error}

          </div>
        )}

      </div>

    </div>
  );
}


export default CampfireScreenShare;