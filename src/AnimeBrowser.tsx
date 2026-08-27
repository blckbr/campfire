import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import {
  ANIME_SOURCES,
  type AnimeSource,
} from "./animeSources";

import {
  useCampfireWebRTC,
} from "./useCampfireWebRTC";

import {
  useCampfireWatchTogether,
} from "./useCampfireWatchTogether";

import {
  prepareAnimeWatchCapture,
  stopAnimeWatchCapture,
} from "./desktop";

import {
  CAMPFIRE_NATIVE_OVERLAY_EVENT,
  isCampfireNativeOverlayBlocked,
} from "./campfireNativeOverlay";

import "./AnimeSitesBrowser.css";


type Props = {
  campfireId: string;

  onWatchTogether?: () => void;
};




type AnimeBrowserErrorBoundaryProps = {
  children: ReactNode;
};


type AnimeBrowserErrorBoundaryState = {
  error: Error | null;
};


class AnimeBrowserErrorBoundary extends Component<
  AnimeBrowserErrorBoundaryProps,
  AnimeBrowserErrorBoundaryState
> {
  state: AnimeBrowserErrorBoundaryState = {
    error: null,
  };


  static getDerivedStateFromError(
    error: Error
  ): AnimeBrowserErrorBoundaryState {
    return {
      error,
    };
  }


  componentDidCatch(
    error: Error,
    info: ErrorInfo
  ) {
    console.error(
      "[Campfire Anime Browser] erro de renderização isolado:",
      error,
      info
    );
  }


  render() {
    if (
      this.state.error
    ) {
      return (
        <div className="animeSitesRoot">
          <section className="animeSitesWelcome">
            <div className="animeSitesWelcomeIcon">
              ⚠️
            </div>

            <h3>
              A aba Animes encontrou um erro
            </h3>

            <p>
              O erro foi isolado para não apagar a sala inteira da Campfire.
            </p>

            <small>
              {this.state.error.message ||
                "Erro desconhecido no navegador de animes."}
            </small>
          </section>
        </div>
      );
    }


    return this.props.children;
  }
}


type NativeWebviewHandle = {
  close: () => Promise<void>;

  hide: () => Promise<void>;

  show: () => Promise<void>;

  setAutoResize: (
    value:
      boolean
  ) => Promise<void>;

  setPosition: (
    position:
      unknown
  ) => Promise<void>;

  setSize: (
    size:
      unknown
  ) => Promise<void>;

  setFocus: () => Promise<void>;

  once: (
    event:
      string,

    handler:
      (event: unknown) => void
  ) => unknown;
};


function makeWebviewLabel():
  string {
  return (
    `campfire-anime-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
}


function AnimeBrowserRuntime({
  campfireId,
  onWatchTogether,
}: Props) {
  /*
   * =========================================================
   * CAMPFIRE ANIME BROWSER
   * =========================================================
   *
   * Fluxo atual:
   *
   * fonte
   *   ↓
   * site real dentro do WebView
   *   ↓
   * anime
   *   ↓
   * episódio
   *   ↓
   * play
   *   ↓
   * líder decide transmitir
   *   ↓
   * participantes entram somente se quiserem
   *
   * O transporte desta etapa reutiliza o WebRTC que já existe
   * no Campfire. A troca por SFU/relay central não exige mudar
   * esta interface.
   */

  void onWatchTogether;


  const rtc =
    useCampfireWebRTC(
      campfireId
    );


  /*
   * Usamos a autoridade já existente do Watch Together
   * somente para saber quem é o Leader da Campfire.
   */

  const watchAuthority =
    useCampfireWatchTogether(
      campfireId
    );


  const viewportRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const viewerStageRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const remoteVideoRef =
    useRef<HTMLVideoElement | null>(
      null
    );


  const nativeWebviewRef =
    useRef<NativeWebviewHandle | null>(
      null
    );


  /*
   * O WebView nativo nunca deve aparecer antes de receber
   * bounds válidos. Isso evita a “tela branca” cobrindo toda
   * a janela principal durante a criação do child WebView.
   */
  const allowWebviewRevealRef =
    useRef(
      false
    );


  /*
   * Menus/modais da Campfire precisam ficar acima do WebContentsView
   * nativo. O valor inicial cobre overlays que já estavam abertos antes
   * da aba Animes montar.
   */
  const nativeOverlayBlockedRef =
    useRef(
      isCampfireNativeOverlayBlocked()
    );


  /*
   * Mantém o estado de fullscreen disponível no cleanup final
   * sem fazer o efeito desmontar/remontar quando o estado muda.
   */
  const browserFullscreenRef =
    useRef(
      false
    );


  const localBroadcastStreamRef =
    useRef<MediaStream | null>(
      null
    );


  const [
    selectedSource,
    setSelectedSource,
  ] =
    useState<AnimeSource | null>(
      null
    );


  const [
    browserState,
    setBrowserState,
  ] =
    useState<
      "idle" |
      "creating" |
      "ready" |
      "error"
    >(
      "idle"
    );


  const [
    browserError,
    setBrowserError,
  ] =
    useState("");


  const [
    shareError,
    setShareError,
  ] =
    useState("");


  const [
    statusText,
    setStatusText,
  ] =
    useState(
      "Escolha uma fonte para começar."
    );


  const [
    browserFullscreen,
    setBrowserFullscreen,
  ] =
    useState(
      false
    );


  useEffect(
    () => {
      browserFullscreenRef.current =
        browserFullscreen;
    },
    [
      browserFullscreen,
    ]
  );


  const [
    dismissedSessionId,
    setDismissedSessionId,
  ] =
    useState<
      string |
      null
    >(
      null
    );


  const sortedSources =
    useMemo(
      () =>
        [
          ...ANIME_SOURCES,
        ],
      []
    );


  const activeAnimeSession =
    useMemo(
      () => {
        const session =
          rtc.activeSession;


        if (
          !session ||
          session.sessionType !==
            "screen" ||
          !session.title
            ?.startsWith(
              "Anime •"
            )
        ) {
          return null;
        }


        return session;
      },
      [
        rtc.activeSession,
      ]
    );


  const isAnimeHost =
    Boolean(
      activeAnimeSession &&
      rtc.currentUserId &&
      activeAnimeSession
        .hostId ===
        rtc.currentUserId
    );


  const shouldOfferJoin =
    Boolean(
      activeAnimeSession &&
      !isAnimeHost &&
      activeAnimeSession.id !==
        dismissedSessionId &&
      rtc.viewerState ===
        "idle"
    );


  const viewerWatching =
    Boolean(
      activeAnimeSession &&
      !isAnimeHost &&
      (
        rtc.viewerState ===
          "waiting" ||
        rtc.viewerState ===
          "connecting" ||
        rtc.viewerState ===
          "connected"
      )
    );


  /* ==========================================================
     LOCAL STREAM CLEANUP
     ========================================================== */

  const stopLocalBroadcastTracks =
    useCallback(
      () => {
        const stream =
          localBroadcastStreamRef
            .current;


        localBroadcastStreamRef.current =
          null;


        if (!stream) {
          return;
        }


        for (
          const track
          of stream.getTracks()
        ) {
          try {
            track.stop();
          } catch {
            // best-effort
          }
        }
      },
      []
    );


  /* ==========================================================
     CLOSE WEBVIEW
     ========================================================== */

  const closeNativeWebview =
    useCallback(
      async () => {
        const webview =
          nativeWebviewRef.current;


        /*
         * Primeiro bloqueia qualquer tentativa concorrente de
         * mostrar o WebView; só depois remove a referência.
         */
        allowWebviewRevealRef.current =
          false;


        nativeWebviewRef.current =
          null;


        if (!webview) {
          return;
        }


        try {
          await webview.close();
        } catch (
          closeError
        ) {
          console.warn(
            "[Campfire Anime Browser] erro fechando WebView:",
            closeError
          );
        }
      },
      []
    );


  /* ==========================================================
     FOCUS DO WEBVIEW
     ========================================================== */

  const focusNativeWebview =
    useCallback(
      async () => {
        const webview =
          nativeWebviewRef.current;


        if (
          !webview ||
          nativeOverlayBlockedRef.current
        ) {
          return;
        }


        try {
          /*
           * No Windows/Electron, o primeiro clique pode virar
           * apenas uma troca de foco quando o child WebView acabou
           * de ser mostrado/redimensionado. Damos foco duas vezes,
           * separadas por um frame, para que o próximo clique já seja
           * entregue à página (Goyabu/AnimeFire/etc.).
           */
          await webview.setFocus();


          await new Promise<void>(
            resolve => {
              window.requestAnimationFrame(
                () => resolve()
              );
            }
          );


          if (
            nativeWebviewRef.current ===
              webview
          ) {
            await webview.setFocus();
          }
        } catch (focusError) {
          console.warn(
            "[Campfire Anime Browser] foco do WebView:",
            focusError
          );
        }
      },
      []
    );


  /* ==========================================================
     BOUNDS
     ========================================================== */

  const updateNativeBounds =
    useCallback(
      async () => {
        const element =
          viewportRef.current;


        const webview =
          nativeWebviewRef.current;


        if (
          !element ||
          !webview
        ) {
          return;
        }


        const rect =
          element
            .getBoundingClientRect();


        const x =
          Math.max(
            0,
            Math.round(
              rect.left
            )
          );


        const y =
          Math.max(
            0,
            Math.round(
              rect.top
            )
          );


        const right =
          Math.min(
            window.innerWidth,
            rect.right
          );


        const bottom =
          Math.min(
            window.innerHeight,
            rect.bottom
          );


        const width =
          Math.max(
            1,
            Math.round(
              right - x
            )
          );


        const height =
          Math.max(
            1,
            Math.round(
              bottom - y
            )
          );


        const blocked =
          nativeOverlayBlockedRef.current;


        try {
          const {
            LogicalPosition,
            LogicalSize,
          } =
            await import(
              "./desktop"
            );


          await webview
            .setPosition(
              new LogicalPosition(
                x,
                y
              )
            );


          await webview
            .setSize(
              new LogicalSize(
                width,
                height
              )
            );


          if (
            width <= 4 ||
            height <= 4 ||
            blocked ||
            !allowWebviewRevealRef.current
          ) {
            await webview.hide();
          } else {
            await webview.show();
          }
        } catch (
          boundsError
        ) {
          console.error(
            "[Campfire Anime Browser] erro nos bounds:",
            boundsError
          );
        }
      },
      []
    );


  /* ==========================================================
     GLOBAL CAMPFIRE OVERLAY GUARD
     ========================================================== */

  useEffect(() => {
    const handleOverlayChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          blocked?: boolean;
        }>
      ).detail;

      const blocked =
        detail?.blocked === true;

      nativeOverlayBlockedRef.current =
        blocked;

      const webview =
        nativeWebviewRef.current;

      if (!webview) {
        return;
      }

      if (blocked) {
        void webview
          .hide()
          .catch(() => undefined);

        return;
      }

      if (!allowWebviewRevealRef.current) {
        return;
      }

      void updateNativeBounds()
        .then(() => focusNativeWebview())
        .catch(() => undefined);
    };

    window.addEventListener(
      CAMPFIRE_NATIVE_OVERLAY_EVENT,
      handleOverlayChange
    );

    return () => {
      window.removeEventListener(
        CAMPFIRE_NATIVE_OVERLAY_EVENT,
        handleOverlayChange
      );
    };
  }, [
    focusNativeWebview,
    updateNativeBounds,
  ]);


  /* ==========================================================
     OPEN SOURCE
     ========================================================== */

  const openSourceInsideCampfire =
    useCallback(
      async (
        source:
          AnimeSource
      ) => {
        /*
         * Se o usuário estava assistindo a transmissão
         * de outra pessoa, sai dela antes de navegar.
         */

        if (
          viewerWatching
        ) {
          await rtc
            .leaveViewing();
        }


        setSelectedSource(
          source
        );


        setBrowserState(
          "creating"
        );


        setBrowserError(
          ""
        );


        setShareError(
          ""
        );


        setStatusText(
          `Abrindo ${source.name} dentro do Campfire...`
        );


        allowWebviewRevealRef.current =
          false;


        await closeNativeWebview();


        try {
          const [
            webviewApi,
            windowApi,
          ] =
            await Promise.all([
              import(
                "./desktop"
              ),

              import(
                "./desktop"
              ),
            ]);


          const appWindow =
            windowApi
              .getCurrentWindow();


          const label =
            makeWebviewLabel();


          /*
           * Começa em 1 × 1 para impedir que o
           * child WebView cubra a interface toda
           * antes de receber os bounds corretos.
           */

          const webview =
            new webviewApi.Webview(
              appWindow,
              label,
              {
                url:
                  source.homeUrl,

                x:
                  0,

                y:
                  0,

                width:
                  1,

                height:
                  1,

                focus:
                  false,

                javascriptDisabled:
                  false,

                devtools:
                  true,

                backgroundColor:
                  "#ffffff",
              }
            ) as unknown as
              NativeWebviewHandle;


          nativeWebviewRef.current =
            webview;


          let creationSettled =
            false;


          /*
           * Se o evento de criação nunca completar, removemos
           * o child WebView. Assim ele não pode deixar a janela
           * principal permanentemente coberta.
           */
          const creationWatchdog =
            window.setTimeout(
              () => {
                if (
                  creationSettled ||
                  nativeWebviewRef.current !==
                    webview
                ) {
                  return;
                }


                creationSettled =
                  true;


                allowWebviewRevealRef.current =
                  false;


                nativeWebviewRef.current =
                  null;


                void webview
                  .close()
                  .catch(
                    () => undefined
                  );


                setBrowserState(
                  "error"
                );


                setBrowserError(
                  `O navegador interno de ${source.name} não terminou de abrir. O WebView foi fechado para proteger a interface da Campfire.`
                );
              },
              5000
            );


          webview.once(
            "tauri://created",
            () => {
              void (
                async () => {
                  if (
                    nativeWebviewRef.current !==
                      webview
                  ) {
                    creationSettled =
                      true;


                    window.clearTimeout(
                      creationWatchdog
                    );


                    void webview
                      .close()
                      .catch(
                        () => undefined
                      );


                    return;
                  }


                  try {
                    /*
                     * PRIMEIRO ESCONDE.
                     *
                     * Mesmo que o Electron/WebContentsView tente aplicar
                     * auto-resize durante a criação, ele não pode
                     * permanecer por cima da janela principal.
                     */
                    allowWebviewRevealRef.current =
                      false;


                    await webview
                      .hide();


                    await webview
                      .setAutoResize(
                        false
                      );


                    await new Promise<void>(
                      resolve => {
                        window
                          .requestAnimationFrame(
                            () =>
                              resolve()
                          );
                      }
                    );


                    /*
                     * updateNativeBounds ainda mantém o WebView
                     * escondido porque allowWebviewRevealRef=false.
                     */
                    await updateNativeBounds();


                    if (
                      nativeWebviewRef.current !==
                        webview
                    ) {
                      return;
                    }


                    allowWebviewRevealRef.current =
                      true;


                    await updateNativeBounds();


                    await focusNativeWebview();


                    creationSettled =
                      true;


                    window.clearTimeout(
                      creationWatchdog
                    );


                    setBrowserState(
                      "ready"
                    );


                    setStatusText(
                      `${source.name} aberto. Escolha o anime, o episódio e dê Play.`
                    );
                  } catch (
                    createdError
                  ) {
                    creationSettled =
                      true;


                    window.clearTimeout(
                      creationWatchdog
                    );


                    console.error(
                      "[Campfire Anime Browser] pós-criação:",
                      createdError
                    );


                    allowWebviewRevealRef.current =
                      false;


                    if (
                      nativeWebviewRef.current ===
                        webview
                    ) {
                      nativeWebviewRef.current =
                        null;
                    }


                    try {
                      await webview.hide();
                    } catch {
                      // best-effort
                    }


                    try {
                      await webview.close();
                    } catch {
                      // best-effort
                    }


                    setBrowserState(
                      "error"
                    );


                    setBrowserError(
                      createdError instanceof
                        Error
                        ? createdError.message
                        : "Falha ao posicionar o navegador interno."
                    );
                  }
                }
              )();
            }
          );


          webview.once(
            "tauri://error",
            event => {
              creationSettled =
                true;


              window.clearTimeout(
                creationWatchdog
              );


              console.error(
                "[Campfire Anime Browser] tauri://error:",
                event
              );


              allowWebviewRevealRef.current =
                false;


              if (
                nativeWebviewRef.current ===
                  webview
              ) {
                nativeWebviewRef.current =
                  null;
              }


              void webview
                .close()
                .catch(
                  () => undefined
                );


              setBrowserState(
                "error"
              );


              setBrowserError(
                `O Electron não conseguiu abrir ${source.name}.`
              );
            }
          );


        } catch (
          createError
        ) {
          console.error(
            "[Campfire Anime Browser] criação:",
            createError
          );


          setBrowserState(
            "error"
          );


          setBrowserError(
            createError instanceof
              Error
              ? createError.message
              : "Não foi possível criar o navegador da aba Animes."
          );
        }
      },
      [
        closeNativeWebview,
        focusNativeWebview,
        rtc,
        updateNativeBounds,
        viewerWatching,
      ]
    );


  /* ==========================================================
     APP FULLSCREEN
     ========================================================== */

  const setAnimeFullscreen =
    useCallback(
      async (
        enabled:
          boolean
      ) => {
        if (
          enabled &&
          (
            !selectedSource ||
            browserState !==
              "ready"
          )
        ) {
          return;
        }


        try {
          const {
            getCurrentWindow,
          } =
            await import(
              "./desktop"
            );


          const appWindow =
            getCurrentWindow();


          /*
           * Primeiro muda o estado visual React.
           */

          setBrowserFullscreen(
            enabled
          );


          /*
           * Depois muda a janela nativa.
           */

          await appWindow
            .setFullscreen(
              enabled
            );


          /*
           * Esperamos dois frames:
           * 1. o Windows redimensiona a janela
           * 2. o React recalcula o viewport
           */

          await new Promise<void>(
            resolve => {
              window
                .requestAnimationFrame(
                  () => {
                    window
                      .requestAnimationFrame(
                        () =>
                          resolve()
                      );
                  }
                );
            }
          );


          await updateNativeBounds();


          if (enabled) {
            await focusNativeWebview();
          }
        } catch (
          fullscreenError
        ) {
          console.error(
            "[Campfire Anime Browser] fullscreen:",
            fullscreenError
          );


          setBrowserFullscreen(
            false
          );


          setBrowserError(
            "Não foi possível ativar a tela cheia do Campfire."
          );
        }
      },
      [
        browserState,
        focusNativeWebview,
        selectedSource,
        updateNativeBounds,
      ]
    );


  useEffect(
    () => {
      if (
        !selectedSource
      ) {
        return;
      }


      const frame =
        window
          .requestAnimationFrame(
            () => {
              void updateNativeBounds();
            }
          );


      return () => {
        window
          .cancelAnimationFrame(
            frame
          );
      };
    },
    [
      browserFullscreen,
      selectedSource,
      updateNativeBounds,
    ]
  );


  /* ==========================================================
     RESIZE
     ========================================================== */

  useEffect(
    () => {
      let resizeObserver:
        ResizeObserver |
        null =
          null;


      let frame =
        0;


      function scheduleUpdate() {
        if (
          frame
        ) {
          window
            .cancelAnimationFrame(
              frame
            );
        }


        frame =
          window
            .requestAnimationFrame(
              () => {
                frame =
                  0;


                void updateNativeBounds();
              }
            );
      }


      window.addEventListener(
        "resize",
        scheduleUpdate
      );


      if (
        typeof ResizeObserver !==
          "undefined" &&
        viewportRef.current
      ) {
        resizeObserver =
          new ResizeObserver(
            scheduleUpdate
          );


        resizeObserver.observe(
          viewportRef.current
        );
      }


      return () => {
        window.removeEventListener(
          "resize",
          scheduleUpdate
        );


        resizeObserver
          ?.disconnect();


        if (
          frame
        ) {
          window
            .cancelAnimationFrame(
              frame
            );
        }
      };
    },
    [
      updateNativeBounds,
    ]
  );


  /* ==========================================================
     START ANIME BROADCAST
     ========================================================== */

  async function startAnimeBroadcast() {
    setShareError(
      ""
    );


    if (
      !watchAuthority.isLeader
    ) {
      setShareError(
        "Somente o líder da Campfire pode iniciar o Watch Together."
      );

      return;
    }


    if (
      !rtc.canShareScreen
    ) {
      setShareError(
        "Você não possui permissão para transmitir nesta Campfire."
      );

      return;
    }


    if (
      !selectedSource ||
      browserState !==
        "ready"
    ) {
      setShareError(
        "Abra uma fonte e inicie o episódio antes de transmitir."
      );

      return;
    }


    if (
      rtc.activeSession
    ) {
      if (
        isAnimeHost
      ) {
        return;
      }


      setShareError(
        "Já existe uma transmissão ativa nesta Campfire."
      );

      return;
    }


    /*
     * IMPORTANTE:
     *
     * O seletor nativo do getDisplayMedia precisa aparecer ANTES
     * do fullscreen. Quando a janela Campfire entra em fullscreen
     * primeiro, o seletor "Escolha o que transmitir" pode ficar
     * visualmente atrás dela no Windows/WebView2.
     *
     * Portanto:
     *   1. garante modo janela;
     *   2. abre o seletor;
     *   3. só depois da escolha entra em fullscreen.
     */
    const wasFullscreenBeforePicker =
      browserFullscreen;


    if (wasFullscreenBeforePicker) {
      await setAnimeFullscreen(
        false
      );
    }


    try {
      const preparedCapture =
        await prepareAnimeWatchCapture();

      if (!preparedCapture.ok) {
        throw new Error(
          preparedCapture.message ||
          "Não foi possível preparar a captura direta do player."
        );
      }

      const stream =
        await navigator
          .mediaDevices
          .getDisplayMedia({
            video: {
              frameRate: {
                ideal:
                  30,

                max:
                  60,
              },
            },

            audio:
              true,
          });


      const videoTrack =
        stream
          .getVideoTracks()[0];


      if (!videoTrack) {
        for (
          const track
          of stream.getTracks()
        ) {
          track.stop();
        }

        await stopAnimeWatchCapture();

        setShareError(
          "Nenhuma imagem foi selecionada para transmissão."
        );

        return;
      }


      /*
       * A fonte já foi escolhida no seletor nativo. Agora podemos
       * ocupar a tela toda sem esconder as opções de compartilhamento.
       * O stream de captura acompanha o redimensionamento da janela.
       */
      if (!browserFullscreen) {
        await setAnimeFullscreen(
          true
        );
      }


      await focusNativeWebview();


      localBroadcastStreamRef.current =
        stream;


      videoTrack.addEventListener(
        "ended",
        () => {
          stopLocalBroadcastTracks();

          void stopAnimeWatchCapture();

          void rtc
            .stopHosting();
        },
        {
          once:
            true,
        }
      );


      const result =
        await rtc
          .startHosting(
            stream,
            `Anime • ${selectedSource.name}`
          );


      if (
        !result.ok
      ) {
        stopLocalBroadcastTracks();
        await stopAnimeWatchCapture();

        setShareError(
          result.message
        );

        return;
      }


      setStatusText(
        `🔴 ${selectedSource.name} está sendo transmitido para a Campfire.`
      );
    } catch (
      shareStartError
    ) {
      console.error(
        "[Campfire Anime Browser] iniciar transmissão:",
        shareStartError
      );


      stopLocalBroadcastTracks();

      await stopAnimeWatchCapture();

      if (
        shareStartError instanceof
          DOMException &&
        shareStartError.name ===
          "NotAllowedError"
      ) {
        setShareError(
          "A transmissão foi cancelada."
        );


        if (wasFullscreenBeforePicker) {
          await setAnimeFullscreen(
            true
          );
        }

        return;
      }


      setShareError(
        shareStartError instanceof
          Error
          ? shareStartError.message
          : "Não foi possível iniciar a transmissão."
      );
    }
  }


  /* ==========================================================
     STOP ANIME BROADCAST
     ========================================================== */

  async function stopAnimeBroadcast() {
    setShareError(
      ""
    );

    await stopAnimeWatchCapture();

    const result =
      await rtc
        .stopHosting();


    stopLocalBroadcastTracks();


    if (
      !result.ok
    ) {
      setShareError(
        result.message
      );

      return;
    }


    if (
      selectedSource
    ) {
      setStatusText(
        `${selectedSource.name} aberto. A transmissão foi encerrada.`
      );
    }
  }


  /* ==========================================================
     JOIN / LEAVE WATCH TOGETHER
     ========================================================== */

  async function joinAnimeBroadcast() {
    setShareError(
      ""
    );


    /*
     * A escolha é sempre do participante.
     *
     * Só fechamos a navegação local DEPOIS que ele
     * explicitamente escolhe entrar.
     */

    await closeNativeWebview();


    setSelectedSource(
      null
    );


    setBrowserState(
      "idle"
    );


    const result =
      await rtc
        .joinViewing();


    if (
      !result.ok
    ) {
      setShareError(
        result.message
      );
    }
  }


  async function leaveAnimeBroadcast() {
    await rtc
      .leaveViewing();


    setStatusText(
      "Você saiu do Watch Together."
    );
  }


  /* ==========================================================
     REMOTE STREAM
     ========================================================== */

  useEffect(
    () => {
      const video =
        remoteVideoRef.current;


      if (!video) {
        return;
      }


      if (
        rtc.remoteStream
      ) {
        video.srcObject =
          rtc.remoteStream;


        void video
          .play()
          .catch(
            () => undefined
          );

        return;
      }


      video.srcObject =
        null;
    },
    [
      rtc.remoteStream,
      viewerWatching,
    ]
  );


  /* ==========================================================
     VIEWER FULLSCREEN
     ========================================================== */

  async function fullscreenViewer() {
    const element =
      viewerStageRef.current;


    if (!element) {
      return;
    }


    try {
      if (
        document.fullscreenElement
      ) {
        await document
          .exitFullscreen();

        return;
      }


      await element
        .requestFullscreen();
    } catch (
      viewerFullscreenError
    ) {
      console.error(
        "Erro no fullscreen do viewer:",
        viewerFullscreenError
      );
    }
  }


  /* ==========================================================
     SESSION CHANGE
     ========================================================== */

  useEffect(
    () => {
      if (
        !activeAnimeSession
      ) {
        setDismissedSessionId(
          null
        );
      }
    },
    [
      activeAnimeSession,
    ]
  );


  /* ==========================================================
     CLEANUP
     ========================================================== */

  useEffect(
    () => {
      return () => {
        allowWebviewRevealRef.current =
          false;


        void closeNativeWebview();


        stopLocalBroadcastTracks();


        if (
          browserFullscreenRef.current
        ) {
          void import(
            "./desktop"
          )
            .then(
              ({
                getCurrentWindow,
              }) =>
                getCurrentWindow()
                  .setFullscreen(
                    false
                  )
            )
            .catch(
              () => undefined
            );
        }
      };
    },
    [
      closeNativeWebview,
      stopLocalBroadcastTracks,
    ]
  );


  /* ==========================================================
     RETURN TO SOURCES
     ========================================================== */

  async function backToSources() {
    allowWebviewRevealRef.current =
      false;


    if (
      browserFullscreen
    ) {
      await setAnimeFullscreen(
        false
      );
    }


    await closeNativeWebview();


    setSelectedSource(
      null
    );


    setBrowserState(
      "idle"
    );


    setBrowserError(
      ""
    );


    setShareError(
      ""
    );


    setStatusText(
      "Escolha uma fonte para começar."
    );
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      className={
        browserFullscreen
          ? "animeSitesBrowser animeSitesBrowserFullscreen"
          : "animeSitesBrowser"
      }
    >

      {/* =====================================================
          FULLSCREEN CONTROL STRIP
          ===================================================== */}

      {browserFullscreen && (
        <div className="animeSitesFullscreenBar">

          <div>

            <strong>
              📺 {selectedSource?.name ?? "Animes"}
            </strong>


            {isAnimeHost && (
              <span className="animeSitesLiveBadge">
                🔴 AO VIVO • {rtc.viewerCount} participante(s)
              </span>
            )}

          </div>


          <div>

            {selectedSource &&
              watchAuthority.isLeader && (
              isAnimeHost ? (
                <button
                  type="button"

                  className="animeSitesStopBroadcast"

                  onClick={() =>
                    void stopAnimeBroadcast()
                  }
                >
                  ■ Encerrar transmissão
                </button>
              ) : (
                <button
                  type="button"

                  className="animeSitesBroadcast"

                  disabled={
                    !rtc.canShareScreen ||
                    Boolean(
                      rtc.activeSession
                    )
                  }

                  onClick={() =>
                    void startAnimeBroadcast()
                  }
                >
                  🔴 Transmitir anime
                </button>
              )
            )}


            <button
              type="button"

              onClick={() =>
                void setAnimeFullscreen(
                  false
                )
              }
            >
              ⛶ Sair da tela cheia
            </button>

          </div>

        </div>
      )}


      {!browserFullscreen && (
        <header className="animeSitesHeader">

          <div>

            <h2>
              📺 Animes
            </h2>


            <p>
              Navegue diretamente pelas fontes dentro do Campfire.
            </p>

          </div>


          {selectedSource && (
            <button
              type="button"

              className="animeSitesBack"

              onClick={() =>
                void backToSources()
              }
            >
              ← Fontes
            </button>
          )}

        </header>
      )}


      {/* =====================================================
          INVITE TO ACTIVE ANIME WATCH
          ===================================================== */}

      {!browserFullscreen &&
        shouldOfferJoin &&
        activeAnimeSession && (
        <section className="animeWatchInvite">

          <div>

            <span>
              📺
            </span>


            <div>

              <strong>
                Watch Together disponível
              </strong>


              <small>
                {activeAnimeSession
                  .hostDisplayName ||
                  activeAnimeSession
                    .hostUsername ||
                  "O líder"} está transmitindo um anime.
              </small>

            </div>

          </div>


          <div>

            <button
              type="button"

              className="join"

              disabled={
                !rtc.signalingReady
              }

              onClick={() =>
                void joinAnimeBroadcast()
              }
            >
              ▶ Entrar no Watch Together
            </button>


            <button
              type="button"

              onClick={() =>
                setDismissedSessionId(
                  activeAnimeSession.id
                )
              }
            >
              Agora não
            </button>

          </div>

        </section>
      )}


      {!browserFullscreen &&
        !viewerWatching && (
        <section className="animeSitesSourceBar">

          {sortedSources.map(
            source => {
              const active =
                selectedSource
                  ?.id ===
                source.id;


              return (
                <button
                  key={
                    source.id
                  }

                  type="button"

                  className={
                    active
                      ? "animeSitesSource active"
                      : "animeSitesSource"
                  }

                  onClick={() =>
                    void openSourceInsideCampfire(
                      source
                    )
                  }
                >

                  <span className="animeSitesSourceEmoji">
                    {source.emoji}
                  </span>


                  <span>

                    <strong>
                      {source.shortName}
                    </strong>


                    <small>
                      {source.domain}
                    </small>

                  </span>

                </button>
              );
            }
          )}

        </section>
      )}


      {!browserFullscreen &&
        !viewerWatching && (
        <section className="animeSitesToolbar">

          <div className="animeSitesStatus">

            <span
              className={
                browserState ===
                  "ready"
                  ? "ready"
                  : browserState ===
                      "error"
                    ? "error"
                    : ""
              }
            />


            <span>
              {statusText}
            </span>

          </div>


          {selectedSource && (
            <div className="animeSitesToolbarActions">

              <button
                type="button"

                onClick={() =>
                  void (
                    async () => {
                      try {
                        const opener =
                          await import(
                            "./desktop"
                          );


                        await opener.openUrl(
                          selectedSource
                            .homeUrl
                        );
                      } catch (
                        openError
                      ) {
                        console.error(
                          "[Campfire Anime Browser] abrir externo:",
                          openError
                        );


                        setBrowserError(
                          "Não foi possível abrir a fonte no navegador externo."
                        );
                      }
                    }
                  )()
                }
              >
                ↗ Abrir externo
              </button>


              <button
                type="button"

                disabled={
                  browserState !==
                    "ready"
                }

                onClick={() =>
                  void setAnimeFullscreen(
                    true
                  )
                }
              >
                ⛶ Tela cheia
              </button>


              {watchAuthority.isLeader && (
                isAnimeHost ? (
                  <button
                    type="button"

                    className="animeSitesStopBroadcast"

                    onClick={() =>
                      void stopAnimeBroadcast()
                    }
                  >
                    ■ Encerrar
                  </button>
                ) : (
                  <button
                    type="button"

                    className="animeSitesTransmit"

                    disabled={
                      browserState !==
                        "ready" ||
                      !rtc.canShareScreen ||
                      Boolean(
                        rtc.activeSession
                      )
                    }

                    onClick={() =>
                      void startAnimeBroadcast()
                    }
                  >
                    🔴 Transmitir anime
                  </button>
                )
              )}

            </div>
          )}

        </section>
      )}


      {(browserError ||
        shareError ||
        rtc.error) && (
        <div className="animeSitesError">

          ⚠️ {
            shareError ||
            browserError ||
            rtc.error
          }

        </div>
      )}


      {/* =====================================================
          VIEWER
          ===================================================== */}

      {viewerWatching &&
        !isAnimeHost && (
        <section
          ref={
            viewerStageRef
          }

          className="animeRemoteViewer"
        >

          <div className="animeRemoteViewerTop">

            <div>

              <span className="animeSitesLiveBadge">
                🔴 WATCH TOGETHER
              </span>


              <strong>
                {activeAnimeSession
                  ?.title
                  ?.replace(
                    /^Anime\s*•\s*/,
                    ""
                  ) ||
                  "Anime"}
              </strong>

            </div>


            <div>

              <button
                type="button"

                onClick={() =>
                  void fullscreenViewer()
                }
              >
                ⛶ Tela cheia
              </button>


              <button
                type="button"

                className="leave"

                onClick={() =>
                  void leaveAnimeBroadcast()
                }
              >
                Sair
              </button>

            </div>

          </div>


          <div className="animeRemoteVideoArea">

            {rtc.remoteStream ? (
              <video
                ref={
                  remoteVideoRef
                }

                autoPlay

                playsInline
              />
            ) : (
              <div className="animeRemoteWaiting">

                <span>
                  🔥
                </span>


                <strong>
                  {rtc.viewerState ===
                    "waiting"
                    ? "Aguardando o líder..."
                    : "Conectando ao Watch Together..."}
                </strong>

              </div>
            )}

          </div>

        </section>
      )}


      {/* =====================================================
          EMPTY STATE
          ===================================================== */}

      {!selectedSource &&
        !viewerWatching && (
        <section className="animeSitesWelcome">

          <div className="animeSitesWelcomeIcon">
            📺
          </div>


          <h3>
            Escolha onde navegar
          </h3>


          <p>
            Clique em uma das fontes acima. O site completo será aberto aqui dentro:
            catálogo, busca, anime, episódios e o player oferecido pela própria fonte.
          </p>


          <small>
            Participar de uma transmissão de anime é sempre opcional para os demais membros da Campfire.
          </small>

        </section>
      )}


      {/* =====================================================
          SOURCE WEBVIEW SLOT
          ===================================================== */}

      {!viewerWatching && (
        <div
          ref={
            viewportRef
          }

          className={
            selectedSource
              ? "animeSitesViewport visible"
              : "animeSitesViewport"
          }
        >

          {selectedSource &&
            browserState ===
              "creating" && (
            <div className="animeSitesLoading">

              <span>
                🔥
              </span>


              <strong>
                Abrindo {selectedSource.name}...
              </strong>

            </div>
          )}


          {selectedSource &&
            browserState ===
              "ready" && (
            <div className="animeSitesBehindWebview">
              {selectedSource.name}
            </div>
          )}

        </div>
      )}


      {!browserFullscreen && (
        <footer className="animeSitesFooter">

          {isAnimeHost ? (
            <span className="animeSitesFooterLive">
              🔴 Transmitindo • {rtc.viewerCount} participante(s)
            </span>
          ) : (
            <span>
              📺 Navegação e reprodução dentro da aba.
            </span>
          )}


          <span>
            O participante escolhe se entra ou não no Watch Together.
          </span>

        </footer>
      )}

    </div>
  );
}


function AnimeBrowser(
  props: Props
) {
  return (
    <AnimeBrowserErrorBoundary>
      <AnimeBrowserRuntime
        {...props}
      />
    </AnimeBrowserErrorBoundary>
  );
}


export default AnimeBrowser;
