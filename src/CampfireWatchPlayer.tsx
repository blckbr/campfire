import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Hls from "hls.js";

import {
  type CampfireWatchSession,
  type WatchActionResult,
  type WatchPlaybackState,
  getEstimatedWatchPosition,
} from "./useCampfireWatchTogether";

import "./CampfireWatchPlayer.css";


/* ============================================================
   YOUTUBE TYPES
   ============================================================ */

type YouTubePlayerEvent = {
  target: YouTubePlayer;
};


type YouTubeStateEvent = {
  target: YouTubePlayer;
  data: number;
};


type YouTubeErrorEvent = {
  data: number;
};


type YouTubePlayer = {
  playVideo: () => void;

  pauseVideo: () => void;

  seekTo: (
    seconds: number,
    allowSeekAhead: boolean
  ) => void;

  getCurrentTime: () => number;

  getDuration: () => number;

  getPlayerState: () => number;

  setVolume: (
    volume: number
  ) => void;

  destroy: () => void;
};


type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;

      width?: string | number;

      height?: string | number;

      playerVars?: Record<
        string,
        string | number
      >;

      events?: {
        onReady?: (
          event: YouTubePlayerEvent
        ) => void;

        onStateChange?: (
          event: YouTubeStateEvent
        ) => void;

        onError?: (
          event: YouTubeErrorEvent
        ) => void;
      };
    }
  ) => YouTubePlayer;
};


declare global {
  interface Window {
    YT?: YouTubeNamespace;

    onYouTubeIframeAPIReady?:
      () => void;
  }
}


/* ============================================================
   YOUTUBE STATES
   ============================================================ */

const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;


/* ============================================================
   YOUTUBE API
   ============================================================ */

let youtubeApiPromise:
  Promise<YouTubeNamespace> |
  null = null;


function loadYouTubeApi():
  Promise<YouTubeNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(
      window.YT
    );
  }


  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }


  youtubeApiPromise =
    new Promise(
      (
        resolve,
        reject
      ) => {
        const previousCallback =
          window
            .onYouTubeIframeAPIReady;


        window
          .onYouTubeIframeAPIReady =
          () => {
            previousCallback?.();


            if (window.YT?.Player) {
              resolve(
                window.YT
              );
            } else {
              reject(
                new Error(
                  "A API do YouTube não foi carregada."
                )
              );
            }
          };


        const existing =
          document.querySelector(
            'script[src="https://www.youtube.com/iframe_api"]'
          );


        if (!existing) {
          const script =
            document.createElement(
              "script"
            );


          script.src =
            "https://www.youtube.com/iframe_api";

          script.async =
            true;


          script.onerror =
            () => {
              reject(
                new Error(
                  "Não foi possível carregar o player do YouTube."
                )
              );
            };


          document.head
            .appendChild(
              script
            );
        }


        window.setTimeout(
          () => {
            if (!window.YT?.Player) {
              reject(
                new Error(
                  "O player do YouTube demorou demais para responder."
                )
              );
            }
          },
          15000
        );
      }
    );


  return youtubeApiPromise;
}


/* ============================================================
   HELPERS
   ============================================================ */

function formatTime(
  seconds: number
): string {
  if (
    !Number.isFinite(
      seconds
    )
  ) {
    return "0:00";
  }


  const total =
    Math.max(
      0,
      Math.floor(
        seconds
      )
    );


  const hours =
    Math.floor(
      total / 3600
    );


  const minutes =
    Math.floor(
      (total % 3600) / 60
    );


  const secs =
    total % 60;


  if (hours > 0) {
    return (
      `${hours}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(secs).padStart(2, "0")}`
    );
  }


  return (
    `${minutes}:` +
    `${String(secs).padStart(2, "0")}`
  );
}


function youtubeErrorMessage(
  code: number
): string {
  switch (code) {
    case 2:
      return "O identificador do vídeo do YouTube é inválido.";

    case 5:
      return "O vídeo não pôde ser reproduzido pelo player HTML5.";

    case 100:
      return "O vídeo não existe ou foi removido.";

    case 101:
    case 150:
      return "O proprietário do vídeo não permite reprodução incorporada.";

    default:
      return `Erro do player do YouTube (${code}).`;
  }
}


function isHlsUrl(
  value:
    string |
    null |
    undefined
): boolean {
  if (!value) {
    return false;
  }


  try {
    const url =
      new URL(value);


    return url.pathname
      .toLowerCase()
      .endsWith(
        ".m3u8"
      );
  } catch {
    return value
      .toLowerCase()
      .includes(
        ".m3u8"
      );
  }
}


/* ============================================================
   PROPS
   ============================================================ */

type Props = {
  session:
    CampfireWatchSession;

  isLeader:
    boolean;

  busy:
    boolean;

  onControl: (
    state:
      WatchPlaybackState,

    positionSeconds:
      number
  ) => Promise<WatchActionResult>;

  onStop:
    () => Promise<WatchActionResult>;
};


/* ============================================================
   PLAYER
   ============================================================ */

function CampfireWatchPlayer({
  session,
  isLeader,
  busy,
  onControl,
  onStop,
}: Props) {
  const youtubeHostRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const youtubePlayerRef =
    useRef<YouTubePlayer | null>(
      null
    );


  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );


  /*
   * Instância HLS ativa.
   */

  const hlsRef =
    useRef<Hls | null>(
      null
    );


  const playerShellRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const joinedRef =
    useRef(false);


  const sessionRef =
    useRef(session);


  const isLeaderRef =
    useRef(isLeader);


  const onControlRef =
    useRef(onControl);


  const onStopRef =
    useRef(onStop);


  const volumeRef =
    useRef(80);


  const ignoreNativeUntilRef =
    useRef(0);


  const nativeControlBusyRef =
    useRef(false);


  const endingSessionRef =
    useRef(false);


  const [
    hidden,
    setHidden,
  ] =
    useState(false);


  const [
    joined,
    setJoined,
  ] =
    useState(false);


  const [
    ready,
    setReady,
  ] =
    useState(false);


  const [
    playerError,
    setPlayerError,
  ] =
    useState("");


  const [
    displayPosition,
    setDisplayPosition,
  ] =
    useState(
      getEstimatedWatchPosition(
        session
      )
    );


  const [
    duration,
    setDuration,
  ] =
    useState(0);


  const [
    volume,
    setVolume,
  ] =
    useState(80);


  const [
    seekDraft,
    setSeekDraft,
  ] =
    useState<number | null>(
      null
    );


  /* ==========================================================
     REFS
     ========================================================== */

  useEffect(() => {
    sessionRef.current =
      session;
  }, [
    session,
  ]);


  useEffect(() => {
    joinedRef.current =
      joined;
  }, [
    joined,
  ]);


  useEffect(() => {
    isLeaderRef.current =
      isLeader;
  }, [
    isLeader,
  ]);


  useEffect(() => {
    onControlRef.current =
      onControl;
  }, [
    onControl,
  ]);


  useEffect(() => {
    onStopRef.current =
      onStop;
  }, [
    onStop,
  ]);


  useEffect(() => {
    volumeRef.current =
      volume;
  }, [
    volume,
  ]);


  /*
   * =========================================================
   * NOVA SESSÃO
   * =========================================================
   */

  useEffect(() => {
    setHidden(false);

    setJoined(false);

    joinedRef.current =
      false;

    setSeekDraft(null);

    setPlayerError("");

    setReady(false);

    setDuration(0);

    endingSessionRef.current =
      false;
  }, [
    session.id,
  ]);


  /* ==========================================================
     VOLTAR AOS ANIMES
     ========================================================== */

  function backToAnimeList() {
    joinedRef.current =
      false;

    setJoined(false);

    setHidden(true);

    setSeekDraft(null);

    setPlayerError("");
  }


  /* ==========================================================
     FINAL DO VÍDEO
     ========================================================== */

  const handlePlaybackEnded =
    useCallback(
      () => {
        joinedRef.current =
          false;

        setJoined(false);

        setHidden(true);


        /*
         * O controlador encerra
         * a sessão para todos.
         */

        if (
          !isLeaderRef.current
        ) {
          return;
        }


        if (
          endingSessionRef.current
        ) {
          return;
        }


        endingSessionRef.current =
          true;


        void onStopRef
          .current()
          .catch(
            (stopError) => {
              console.error(
                "Erro encerrando Watch Together:",
                stopError
              );
            }
          )
          .finally(
            () => {
              endingSessionRef.current =
                false;
            }
          );
      },
      []
    );


  /* ==========================================================
     FULLSCREEN
     ========================================================== */

  async function fullscreen() {
    const element =
      playerShellRef.current;


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
      fullscreenError
    ) {
      console.error(
        "Erro ao entrar em tela cheia:",
        fullscreenError
      );


      setPlayerError(
        "Não foi possível ativar a tela cheia."
      );
    }
  }


  /* ==========================================================
     POSIÇÃO
     ========================================================== */

  const getCurrentPosition =
    useCallback(
      () => {
        if (
          sessionRef
            .current
            .provider ===
          "youtube"
        ) {
          const player =
            youtubePlayerRef
              .current;


          if (player) {
            const time =
              player
                .getCurrentTime();


            if (
              Number.isFinite(
                time
              )
            ) {
              return time;
            }
          }
        }


        if (
          sessionRef
            .current
            .provider ===
          "html5"
        ) {
          const video =
            videoRef.current;


          if (
            video &&
            Number.isFinite(
              video.currentTime
            )
          ) {
            return video.currentTime;
          }
        }


        return (
          getEstimatedWatchPosition(
            sessionRef.current
          )
        );
      },
      []
    );


  /* ==========================================================
     CONTROLE NATIVO -> CAMPFIRE
     ========================================================== */

  const sendNativeControl =
    useCallback(
      async (
        state:
          WatchPlaybackState,

        position:
          number
      ) => {
        if (
          nativeControlBusyRef
            .current
        ) {
          return;
        }


        if (
          !isLeaderRef.current
        ) {
          return;
        }


        nativeControlBusyRef.current =
          true;


        ignoreNativeUntilRef.current =
          Date.now() +
          1100;


        try {
          await onControlRef
            .current(
              state,
              Math.max(
                0,
                position
              )
            );
        } finally {
          nativeControlBusyRef.current =
            false;
        }
      },
      []
    );


  /* ==========================================================
     SINCRONIZAÇÃO
     ========================================================== */

  const syncPlayer =
    useCallback(
      (
        allowPlayback = false
      ) => {
        if (hidden) {
          return;
        }


        const currentSession =
          sessionRef.current;


        const target =
          getEstimatedWatchPosition(
            currentSession
          );


        /*
         * ====================================================
         * YOUTUBE
         * ====================================================
         */

        if (
          currentSession.provider ===
          "youtube"
        ) {
          const player =
            youtubePlayerRef
              .current;


          if (!player) {
            return;
          }


          ignoreNativeUntilRef.current =
            Date.now() +
            900;


          const current =
            player
              .getCurrentTime();


          if (
            !Number.isFinite(
              current
            ) ||
            Math.abs(
              current -
                target
            ) >
              1.15
          ) {
            player.seekTo(
              target,
              true
            );
          }


          if (
            currentSession
              .playback_state ===
              "playing" &&
            (
              joinedRef.current ||
              allowPlayback
            )
          ) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }


          const videoDuration =
            player
              .getDuration();


          if (
            Number.isFinite(
              videoDuration
            ) &&
            videoDuration >
              0
          ) {
            setDuration(
              videoDuration
            );
          }


          return;
        }


        /*
         * ====================================================
         * HTML5 / HLS
         * ====================================================
         *
         * hls.js alimenta o mesmo <video>,
         * então play/pause/currentTime
         * continuam exatamente iguais.
         */

        const video =
          videoRef.current;


        if (!video) {
          return;
        }


        if (
          Number.isFinite(
            video.currentTime
          ) &&
          Math.abs(
            video.currentTime -
              target
          ) >
            1.15
        ) {
          try {
            video.currentTime =
              target;
          } catch {
            // metadata ainda não carregou
          }
        }


        if (
          currentSession
            .playback_state ===
              "playing" &&
          (
            joinedRef.current ||
            allowPlayback
          )
        ) {
          void video
            .play()
            .catch(
              () => {
                setPlayerError(
                  "A reprodução automática foi bloqueada. Clique em Entrar na exibição."
                );
              }
            );
        } else {
          video.pause();
        }


        if (
          Number.isFinite(
            video.duration
          ) &&
          video.duration >
            0
        ) {
          setDuration(
            video.duration
          );
        }
      },
      [
        hidden,
      ]
    );


  /* ==========================================================
     YOUTUBE PLAYER
     ========================================================== */

  useEffect(() => {
    if (hidden) {
      return;
    }


    if (
      session.provider !==
      "youtube"
    ) {
      return;
    }


    if (
      !session.media_id ||
      !youtubeHostRef.current
    ) {
      return;
    }


    let disposed =
      false;


    setReady(false);

    setPlayerError("");


    void loadYouTubeApi()
      .then(
        (YT) => {
          if (
            disposed ||
            !youtubeHostRef.current
          ) {
            return;
          }


          youtubePlayerRef
            .current
            ?.destroy();


          youtubePlayerRef.current =
            new YT.Player(
              youtubeHostRef.current,
              {
                videoId:
                  session.media_id!,

                width:
                  "100%",

                height:
                  "100%",

                playerVars: {
                  controls:
                    1,

                  fs:
                    1,

                  disablekb:
                    0,

                  autoplay:
                    0,

                  playsinline:
                    1,

                  hl:
                    "pt-BR",

                  cc_lang_pref:
                    "pt",

                  rel:
                    0,

                  iv_load_policy:
                    3,
                },


                events: {
                  onReady:
                    (event) => {
                      if (disposed) {
                        return;
                      }


                      youtubePlayerRef.current =
                        event.target;


                      event.target
                        .setVolume(
                          volumeRef.current
                        );


                      const videoDuration =
                        event.target
                          .getDuration();


                      if (
                        Number.isFinite(
                          videoDuration
                        ) &&
                        videoDuration >
                          0
                      ) {
                        setDuration(
                          videoDuration
                        );
                      }


                      setReady(true);

                      syncPlayer();
                    },


                  onStateChange:
                    (event) => {
                      if (
                        disposed ||
                        !joinedRef.current
                      ) {
                        return;
                      }


                      if (
                        event.data ===
                        YT_ENDED
                      ) {
                        handlePlaybackEnded();

                        return;
                      }


                      if (
                        Date.now() <
                        ignoreNativeUntilRef.current
                      ) {
                        return;
                      }


                      const currentSession =
                        sessionRef.current;


                      const currentTime =
                        event.target
                          .getCurrentTime();


                      if (
                        !isLeaderRef.current
                      ) {
                        if (
                          event.data ===
                            YT_PLAYING &&
                          currentSession
                            .playback_state ===
                            "paused"
                        ) {
                          ignoreNativeUntilRef.current =
                            Date.now() +
                            700;


                          window.setTimeout(
                            () => {
                              syncPlayer();
                            },
                            60
                          );
                        }


                        if (
                          event.data ===
                            YT_PAUSED &&
                          currentSession
                            .playback_state ===
                            "playing"
                        ) {
                          ignoreNativeUntilRef.current =
                            Date.now() +
                            700;


                          window.setTimeout(
                            () => {
                              syncPlayer();
                            },
                            60
                          );
                        }


                        return;
                      }


                      if (
                        event.data ===
                          YT_PLAYING &&
                        currentSession
                          .playback_state !==
                          "playing"
                      ) {
                        void sendNativeControl(
                          "playing",
                          currentTime
                        );

                        return;
                      }


                      if (
                        event.data ===
                          YT_PAUSED &&
                        currentSession
                          .playback_state !==
                          "paused"
                      ) {
                        void sendNativeControl(
                          "paused",
                          currentTime
                        );
                      }
                    },


                  onError:
                    (event) => {
                      setPlayerError(
                        youtubeErrorMessage(
                          event.data
                        )
                      );
                    },
                },
              }
            );
        }
      )
      .catch(
        (loadError) => {
          console.error(
            loadError
          );


          setPlayerError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar o player do YouTube."
          );
        }
      );


    return () => {
      disposed =
        true;


      youtubePlayerRef
        .current
        ?.destroy();


      youtubePlayerRef.current =
        null;


      setReady(false);
    };
  }, [
    hidden,
    session.id,
    session.provider,
    session.media_id,
    handlePlaybackEnded,
    sendNativeControl,
    syncPlayer,
  ]);


  /* ==========================================================
     HTML5 + HLS.JS
     ========================================================== */

  useEffect(() => {
    if (hidden) {
      return;
    }


    if (
      session.provider !==
      "html5"
    ) {
      return;
    }


    const video =
      videoRef.current;


    const mediaUrl =
      session.media_url;


    if (
      !video ||
      !mediaUrl
    ) {
      return;
    }


    let disposed =
      false;


    setReady(false);

    setPlayerError("");

    setDuration(0);


    video.volume =
      volumeRef.current /
      100;


    /*
     * Destrói qualquer instância HLS
     * anterior antes de trocar a mídia.
     */

    hlsRef.current
      ?.destroy();


    hlsRef.current =
      null;


    const handleLoadedMetadata =
      () => {
        if (disposed) {
          return;
        }


        if (
          Number.isFinite(
            video.duration
          ) &&
          video.duration >
            0
        ) {
          setDuration(
            video.duration
          );
        }


        setReady(true);

        syncPlayer();
      };


    const handleDurationChange =
      () => {
        if (
          Number.isFinite(
            video.duration
          ) &&
          video.duration >
            0
        ) {
          setDuration(
            video.duration
          );
        }
      };


    video.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata
    );


    video.addEventListener(
      "durationchange",
      handleDurationChange
    );


    /*
     * ========================================================
     * HLS
     * ========================================================
     */

    if (
      isHlsUrl(
        mediaUrl
      )
    ) {
      /*
       * Preferimos hls.js quando MSE
       * estiver disponível.
       */

      if (
        Hls.isSupported()
      ) {
        console.log(
          "[Campfire HLS] hls.js ativado:",
          mediaUrl
        );


        const hls =
          new Hls({
            enableWorker:
              true,

            lowLatencyMode:
              false,

            backBufferLength:
              90,
          });


        hlsRef.current =
          hls;


        /*
         * hls.js conecta o HLS
         * ao nosso <video>.
         */

        hls.attachMedia(
          video
        );


        hls.loadSource(
          mediaUrl
        );


        hls.on(
          Hls.Events.MANIFEST_PARSED,

          () => {
            if (disposed) {
              return;
            }


            console.log(
              "[Campfire HLS] Manifest carregado."
            );


            setReady(true);

            syncPlayer();
          }
        );


        hls.on(
          Hls.Events.LEVEL_SWITCHED,

          (
            _event,
            data
          ) => {
            console.log(
              "[Campfire HLS] Qualidade:",
              data.level
            );
          }
        );


        hls.on(
          Hls.Events.ERROR,

          (
            _event,
            data
          ) => {
            console.error(
              "[Campfire HLS]",
              data.type,
              data.details,
              data
            );


            if (
              !data.fatal
            ) {
              return;
            }


            /*
             * Tenta recuperar erros
             * temporários de rede.
             */

            if (
              data.type ===
              Hls.ErrorTypes.NETWORK_ERROR
            ) {
              setPlayerError(
                "A conexão com o stream foi interrompida. Tentando reconectar..."
              );


              hls.startLoad();

              return;
            }


            /*
             * Tenta recuperar erros
             * de decodificação/mídia.
             */

            if (
              data.type ===
              Hls.ErrorTypes.MEDIA_ERROR
            ) {
              setPlayerError(
                "O player encontrou um erro de mídia. Tentando recuperar..."
              );


              hls.recoverMediaError();

              return;
            }


            /*
             * Erro fatal que não
             * conseguimos recuperar.
             */

            setPlayerError(
              `Não foi possível reproduzir o HLS: ${data.details}`
            );


            hls.destroy();


            if (
              hlsRef.current ===
              hls
            ) {
              hlsRef.current =
                null;
            }
          }
        );
      }

      /*
       * Fallback para plataformas
       * com HLS nativo.
       */

      else if (
        video.canPlayType(
          "application/vnd.apple.mpegurl"
        )
      ) {
        console.log(
          "[Campfire HLS] usando HLS nativo."
        );


        video.src =
          mediaUrl;


        video.load();
      }

      else {
        setPlayerError(
          "Este Chromium/Electron não possui suporte a HLS/MSE."
        );
      }
    }

    /*
     * ========================================================
     * MP4 / WEBM / VÍDEO DIRETO
     * ========================================================
     */

    else {
      video.src =
        mediaUrl;


      video.load();
    }


    return () => {
      disposed =
        true;


      video.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );


      video.removeEventListener(
        "durationchange",
        handleDurationChange
      );


      hlsRef.current
        ?.destroy();


      hlsRef.current =
        null;


      /*
       * Interrompe download da
       * mídia anterior.
       */

      try {
        video.pause();

        video.removeAttribute(
          "src"
        );

        video.load();
      } catch {
        // cleanup best-effort
      }


      setReady(false);
    };
  }, [
    hidden,
    session.id,
    session.provider,
    session.media_url,
    syncPlayer,
  ]);


  /* ==========================================================
     NOVO ESTADO RECEBIDO
     ========================================================== */

  useEffect(() => {
    if (
      hidden ||
      !ready
    ) {
      return;
    }


    setSeekDraft(null);

    syncPlayer();
  }, [
    hidden,
    ready,
    session.version,
    session.playback_state,
    session.position_seconds,
    session.state_updated_at,
    syncPlayer,
  ]);


  /* ==========================================================
     DETECTAR SEEK NATIVO YOUTUBE
     ========================================================== */

  useEffect(() => {
    if (
      hidden ||
      !ready
    ) {
      return;
    }


    const timer =
      window.setInterval(
        () => {
          if (
            !joinedRef.current ||
            sessionRef
              .current
              .provider !==
              "youtube"
          ) {
            return;
          }


          const player =
            youtubePlayerRef.current;


          if (!player) {
            return;
          }


          if (
            Date.now() <
            ignoreNativeUntilRef.current
          ) {
            return;
          }


          const playerState =
            player
              .getPlayerState();


          if (
            playerState ===
              YT_BUFFERING ||
            playerState ===
              YT_UNSTARTED ||
            playerState ===
              YT_CUED
          ) {
            return;
          }


          const actual =
            player
              .getCurrentTime();


          if (
            !Number.isFinite(
              actual
            )
          ) {
            return;
          }


          const expected =
            getEstimatedWatchPosition(
              sessionRef.current
            );


          const difference =
            Math.abs(
              actual -
              expected
            );


          if (
            difference < 2
          ) {
            return;
          }


          if (
            isLeaderRef.current
          ) {
            const state:
              WatchPlaybackState =
              playerState ===
              YT_PAUSED
                ? "paused"
                : "playing";


            void sendNativeControl(
              state,
              actual
            );


            return;
          }


          ignoreNativeUntilRef.current =
            Date.now() +
            900;


          player.seekTo(
            expected,
            true
          );


          if (
            sessionRef
              .current
              .playback_state ===
            "playing"
          ) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        },
        800
      );


    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    hidden,
    ready,
    sendNativeControl,
  ]);


  /* ==========================================================
     DETECTAR CONTROLES NATIVOS HTML5/HLS
     ========================================================== */

  useEffect(() => {
    if (
      hidden ||
      !ready ||
      session.provider !==
      "html5"
    ) {
      return;
    }


    const video =
      videoRef.current;


    if (!video) {
      return;
    }


    const handlePlay =
      () => {
        if (
          Date.now() <
          ignoreNativeUntilRef.current
        ) {
          return;
        }


        if (
          !joinedRef.current
        ) {
          return;
        }


        if (
          !isLeaderRef.current
        ) {
          if (
            sessionRef
              .current
              .playback_state ===
            "paused"
          ) {
            ignoreNativeUntilRef.current =
              Date.now() +
              700;


            video.pause();


            video.currentTime =
              getEstimatedWatchPosition(
                sessionRef.current
              );
          }


          return;
        }


        if (
          sessionRef
            .current
            .playback_state !==
          "playing"
        ) {
          void sendNativeControl(
            "playing",
            video.currentTime
          );
        }
      };


    const handlePause =
      () => {
        if (
          video.ended
        ) {
          return;
        }


        if (
          Date.now() <
          ignoreNativeUntilRef.current
        ) {
          return;
        }


        if (
          !joinedRef.current
        ) {
          return;
        }


        if (
          !isLeaderRef.current
        ) {
          if (
            sessionRef
              .current
              .playback_state ===
            "playing"
          ) {
            ignoreNativeUntilRef.current =
              Date.now() +
              700;


            void video
              .play()
              .catch(
                () => undefined
              );
          }


          return;
        }


        if (
          sessionRef
            .current
            .playback_state !==
          "paused"
        ) {
          void sendNativeControl(
            "paused",
            video.currentTime
          );
        }
      };


    video.addEventListener(
      "play",
      handlePlay
    );


    video.addEventListener(
      "pause",
      handlePause
    );


    return () => {
      video.removeEventListener(
        "play",
        handlePlay
      );


      video.removeEventListener(
        "pause",
        handlePause
      );
    };
  }, [
    hidden,
    ready,
    session.provider,
    sendNativeControl,
  ]);


  /* ==========================================================
     RELÓGIO VISUAL
     ========================================================== */

  useEffect(() => {
    if (hidden) {
      return;
    }


    const timer =
      window.setInterval(
        () => {
          if (
            joinedRef.current &&
            ready
          ) {
            setDisplayPosition(
              getCurrentPosition()
            );
          } else {
            setDisplayPosition(
              getEstimatedWatchPosition(
                sessionRef.current
              )
            );
          }


          if (
            sessionRef
              .current
              .provider ===
            "youtube"
          ) {
            const value =
              youtubePlayerRef
                .current
                ?.getDuration();


            if (
              value &&
              Number.isFinite(
                value
              )
            ) {
              setDuration(
                value
              );
            }
          }


          if (
            sessionRef
              .current
              .provider ===
            "html5"
          ) {
            const value =
              videoRef
                .current
                ?.duration;


            if (
              value &&
              Number.isFinite(
                value
              )
            ) {
              setDuration(
                value
              );
            }
          }
        },
        250
      );


    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    hidden,
    getCurrentPosition,
    ready,
  ]);


  /* ==========================================================
     ENTRAR
     ========================================================== */

  function joinWatch() {
    setJoined(true);

    joinedRef.current =
      true;

    setPlayerError("");


    ignoreNativeUntilRef.current =
      Date.now() +
      900;


    syncPlayer(
      true
    );
  }


  /* ==========================================================
     VOLUME LOCAL
     ========================================================== */

  function changeVolume(
    nextVolume: number
  ) {
    const safe =
      Math.min(
        100,
        Math.max(
          0,
          nextVolume
        )
      );


    setVolume(
      safe
    );

    volumeRef.current =
      safe;


    youtubePlayerRef
      .current
      ?.setVolume(
        safe
      );


    if (
      videoRef.current
    ) {
      videoRef.current.volume =
        safe / 100;
    }
  }


  /* ==========================================================
     PLAY / PAUSE GLOBAL
     ========================================================== */

  async function togglePlayback() {
    if (
      !isLeader ||
      busy
    ) {
      return;
    }


    const position =
      getCurrentPosition();


    const nextState:
      WatchPlaybackState =
      session.playback_state ===
      "playing"
        ? "paused"
        : "playing";


    ignoreNativeUntilRef.current =
      Date.now() +
      1000;


    if (
      nextState ===
      "playing"
    ) {
      if (
        session.provider ===
        "youtube"
      ) {
        youtubePlayerRef
          .current
          ?.playVideo();
      } else {
        void videoRef
          .current
          ?.play()
          .catch(
            () => undefined
          );
      }
    } else {
      if (
        session.provider ===
        "youtube"
      ) {
        youtubePlayerRef
          .current
          ?.pauseVideo();
      } else {
        videoRef
          .current
          ?.pause();
      }
    }


    await onControl(
      nextState,
      position
    );
  }


  /* ==========================================================
     SEEK GLOBAL
     ========================================================== */

  async function commitSeek() {
    if (
      !isLeader ||
      seekDraft === null ||
      busy
    ) {
      return;
    }


    const target =
      Math.max(
        0,
        seekDraft
      );


    ignoreNativeUntilRef.current =
      Date.now() +
      1000;


    if (
      session.provider ===
      "youtube"
    ) {
      youtubePlayerRef
        .current
        ?.seekTo(
          target,
          true
        );
    } else if (
      videoRef.current
    ) {
      videoRef.current.currentTime =
        target;
    }


    await onControl(
      session.playback_state,
      target
    );


    setSeekDraft(null);
  }


  /* ==========================================================
     PLAYER ESCONDIDO
     ========================================================== */

  if (hidden) {
    return null;
  }


  const shownPosition =
    seekDraft ??
    displayPosition;


  const maxDuration =
    duration > 0
      ? duration
      : Math.max(
          1,
          shownPosition + 60
        );


  const mediaLabel =
    session.provider ===
    "youtube"
      ? "YouTube"

      : isHlsUrl(
          session.media_url
        )
        ? "HLS"

        : "HTML5";


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <section className="campfireWatch">

      {/* ==================================================
          NAVIGATION
          ================================================== */}

      <div className="campfireWatchNavigation">

        <button
          type="button"

          className="campfireWatchBackButton"

          onClick={
            backToAnimeList
          }
        >
          ← Voltar aos animes
        </button>


        <button
          type="button"

          className="campfireWatchTopFullscreen"

          onClick={() =>
            void fullscreen()
          }
        >
          ⛶ Tela cheia
        </button>

      </div>


      {/* ==================================================
          HEADER
          ================================================== */}

      <div className="campfireWatchHeader">

        <div className="campfireWatchHeaderLive">

          <span />

          WATCH TOGETHER

        </div>


        <div className="campfireWatchLeadership">

          {isLeader
            ? "👑 Você controla a exibição"
            : "👑 O controlador da Campfire controla a exibição"}

        </div>

      </div>


      {/* ==================================================
          MEDIA INFO
          ================================================== */}

      <div className="campfireWatchMediaInfo">

        {session.anime_cover && (
          <img
            src={
              session.anime_cover
            }

            alt=""
          />
        )}


        <div>

          <strong>
            {session.anime_title}
          </strong>


          <small>

            {session.episode_label ||
              "Watch Together"}

          </small>

        </div>


        <span className="campfireWatchProvider">

          {mediaLabel}

        </span>

      </div>


      {/* ==================================================
          PLAYER
          ================================================== */}

      <div
        className="campfireWatchPlayerShell"

        ref={
          playerShellRef
        }
      >

        {session.provider ===
          "youtube" && (

          <div
            className="campfireWatchYoutubeHost"

            ref={
              youtubeHostRef
            }
          />
        )}


        {session.provider ===
          "html5" && (

          <video
            ref={
              videoRef
            }

            className="campfireWatchHtml5Video"

            playsInline

            preload="auto"

            controls

            onEnded={
              handlePlaybackEnded
            }
          />
        )}


        {!joined && (
          <div className="campfireWatchJoinOverlay">

            {session.anime_cover && (
              <div
                className="campfireWatchJoinBackground"

                style={{
                  backgroundImage:
                    `url("${session.anime_cover}")`,
                }}
              />
            )}


            <div className="campfireWatchJoinContent">

              <span>
                📺
              </span>


              <strong>
                {session.anime_title}
              </strong>


              {session.episode_label && (
                <small>

                  {session.episode_label}

                </small>
              )}


              <button
                type="button"

                onClick={
                  joinWatch
                }
              >
                ▶ Entrar na exibição
              </button>

            </div>

          </div>
        )}


        {playerError && (
          <div className="campfireWatchPlayerError">

            ⚠️ {playerError}

          </div>
        )}

      </div>


      {/* ==================================================
          CONTROLES
          ================================================== */}

      <div className="campfireWatchControls">

        <button
          type="button"

          className="campfireWatchPlay"

          disabled={
            !joined ||
            !ready ||
            !isLeader ||
            busy
          }

          title={
            isLeader
              ? session.playback_state ===
                  "playing"
                ? "Pausar para todos"
                : "Reproduzir para todos"

              : "Somente o controlador da sessão pode controlar o grupo"
          }

          onClick={() =>
            void togglePlayback()
          }
        >

          {session.playback_state ===
          "playing"
            ? "⏸"
            : "▶"}

        </button>


        <span className="campfireWatchTime">

          {formatTime(
            shownPosition
          )}

        </span>


        <input
          className="campfireWatchProgress"

          type="range"

          min={0}

          max={
            maxDuration
          }

          step={
            0.25
          }

          value={
            Math.min(
              shownPosition,
              maxDuration
            )
          }

          disabled={
            !joined ||
            !ready ||
            !isLeader ||
            busy
          }

          onChange={(
            event
          ) =>
            setSeekDraft(
              Number(
                event.target.value
              )
            )
          }

          onPointerUp={() =>
            void commitSeek()
          }

          onKeyUp={() =>
            void commitSeek()
          }
        />


        <span className="campfireWatchTime">

          {duration > 0
            ? formatTime(
                duration
              )
            : "--:--"}

        </span>


        <div className="campfireWatchVolume">

          <span>
            🔊
          </span>


          <input
            type="range"

            min={0}

            max={100}

            value={
              volume
            }

            onChange={(
              event
            ) =>
              changeVolume(
                Number(
                  event.target.value
                )
              )
            }
          />

        </div>


        <button
          type="button"

          className="campfireWatchFullscreen"

          title="Tela cheia"

          onClick={() =>
            void fullscreen()
          }
        >
          ⛶
        </button>

      </div>


      {/* ==================================================
          FOOTER
          ================================================== */}

      <div className="campfireWatchFooter">

        <div>

          {isLeader ? (
            <span className="campfireWatchLeaderNotice">

              👑 Play, pausa e posição afetam todos.

            </span>
          ) : (
            <span>

              🔒 Volume e tela cheia são locais.

            </span>
          )}

        </div>


        {isLeader && (
          <button
            type="button"

            className="campfireWatchStop"

            disabled={
              busy
            }

            onClick={() =>
              void onStop()
            }
          >
            ■ Encerrar exibição
          </button>
        )}

      </div>

    </section>
  );
}


export default CampfireWatchPlayer;