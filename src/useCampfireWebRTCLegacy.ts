import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  RealtimeChannel,
} from "@supabase/supabase-js";

import {
  supabase,
} from "./lib/supabase";


/*
 * ============================================================
 * TIPOS PÚBLICOS
 * ============================================================
 */

export type CampfireScreenSession = {
  id: string;

  campfireId: string;

  hostId: string;

  sessionType:
    "screen" | "watch";

  title:
    string | null;

  metadata:
    Record<string, unknown>;

  startedAt:
    string;

  hostUsername:
    string | null;

  hostDisplayName:
    string | null;

  hostAvatarUrl:
    string | null;
};


export type WebRTCViewerState =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";


export type WebRTCActionResult = {
  ok: boolean;

  message: string;

  sessionId?: string;
};


/*
 * ============================================================
 * TIPOS INTERNOS
 * ============================================================
 */

type RawScreenSession = {
  id: string;

  campfire_id: string;

  host_id: string;

  session_type:
    "screen" | "watch";

  title:
    string | null;

  metadata:
    unknown;

  started_at:
    string;

  host_username:
    string | null;

  host_display_name:
    string | null;

  host_avatar_url:
    string | null;
};


/*
 * ============================================================
 * SINAIS WEBRTC
 * ============================================================
 */

type ViewerJoinSignal = {
  kind:
    "viewer-join";

  sessionId:
    string;

  viewerId:
    string;
};


type ViewerLeaveSignal = {
  kind:
    "viewer-leave";

  sessionId:
    string;

  viewerId:
    string;

  hostId:
    string;
};


type OfferSignal = {
  kind:
    "offer";

  sessionId:
    string;

  hostId:
    string;

  viewerId:
    string;

  description:
    RTCSessionDescriptionInit;
};


type AnswerSignal = {
  kind:
    "answer";

  sessionId:
    string;

  hostId:
    string;

  viewerId:
    string;

  description:
    RTCSessionDescriptionInit;
};


type IceSignal = {
  kind:
    "ice";

  sessionId:
    string;

  fromId:
    string;

  toId:
    string;

  candidate:
    RTCIceCandidateInit;
};


type HostStopSignal = {
  kind:
    "host-stop";

  sessionId:
    string;

  hostId:
    string;
};


type WebRTCSignal =
  | ViewerJoinSignal
  | ViewerLeaveSignal
  | OfferSignal
  | AnswerSignal
  | IceSignal
  | HostStopSignal;


/*
 * ============================================================
 * CONFIGURAÇÃO WEBRTC
 * ============================================================
 */

const RTC_CONFIGURATION:
  RTCConfiguration = {

    iceServers: [
      {
        urls:
          "stun:stun.cloudflare.com:3478",
      },
    ],

    iceCandidatePoolSize:
      4,
  };


/*
 * ============================================================
 * AUXILIARES
 * ============================================================
 */

function normalizeMetadata(
  value:
    unknown
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  return value as Record<
    string,
    unknown
  >;
}


function mapSession(
  row:
    RawScreenSession
): CampfireScreenSession {
  return {
    id:
      row.id,

    campfireId:
      row.campfire_id,

    hostId:
      row.host_id,

    sessionType:
      row.session_type,

    title:
      row.title,

    metadata:
      normalizeMetadata(
        row.metadata
      ),

    startedAt:
      row.started_at,

    hostUsername:
      row.host_username,

    hostDisplayName:
      row.host_display_name,

    hostAvatarUrl:
      row.host_avatar_url,
  };
}


function errorMessage(
  error:
    unknown
): string {
  let message =
    "";


  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    message =
      String(
        (
          error as {
            message?:
              unknown;
          }
        ).message ??
          ""
      );
  }


  const upper =
    message.toUpperCase();


  if (
    upper.includes(
      "SCREEN_SHARE_NOT_ALLOWED"
    )
  ) {
    return (
      "Você não possui permissão para compartilhar a tela nesta Campfire."
    );
  }


  if (
    upper.includes(
      "SESSION_ALREADY_LIVE"
    )
  ) {
    return (
      "Já existe uma transmissão ativa nesta Campfire."
    );
  }


  if (
    upper.includes(
      "NOT_MEMBER"
    )
  ) {
    return (
      "Você não está mais dentro desta Campfire."
    );
  }


  if (
    upper.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return (
      "Sua sessão expirou."
    );
  }


  if (
    upper.includes(
      "SESSION_NOT_FOUND"
    )
  ) {
    return (
      "Essa transmissão já foi encerrada."
    );
  }


  return (
    message ||
    "Não foi possível concluir a operação."
  );
}


/*
 * ============================================================
 * VALIDAÇÃO DO BROADCAST
 * ============================================================
 */

function isWebRTCSignal(
  value:
    unknown
): value is WebRTCSignal {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }


  return (
    "kind" in value
  );
}


/*
 * ============================================================
 * HOOK
 * ============================================================
 */

export function useCampfireWebRTC(
  campfireId:
    string
) {
  /*
   * =========================================================
   * STATES
   * =========================================================
   */

  const [
    currentUserId,
    setCurrentUserId,
  ] =
    useState<
      string | null
    >(
      null
    );


  const [
    activeSession,
    setActiveSession,
  ] =
    useState<
      CampfireScreenSession | null
    >(
      null
    );


  const [
    canShareScreen,
    setCanShareScreen,
  ] =
    useState(
      false
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    signalingReady,
    setSignalingReady,
  ] =
    useState(
      false
    );


  const [
    viewerState,
    setViewerState,
  ] =
    useState<
      WebRTCViewerState
    >(
      "idle"
    );


  const [
    remoteStream,
    setRemoteStream,
  ] =
    useState<
      MediaStream | null
    >(
      null
    );


  const [
    viewerCount,
    setViewerCount,
  ] =
    useState(
      0
    );


  /*
   * =========================================================
   * REFS
   * =========================================================
   */

  const activeSessionRef =
    useRef<
      CampfireScreenSession | null
    >(
      null
    );


  const currentUserIdRef =
    useRef<
      string | null
    >(
      null
    );


  const localStreamRef =
    useRef<
      MediaStream | null
    >(
      null
    );


  const channelRef =
    useRef<
      RealtimeChannel | null
    >(
      null
    );


  /*
   * Uma conexão por espectador.
   */

  const hostPeersRef =
    useRef<
      Map<
        string,
        RTCPeerConnection
      >
    >(
      new Map()
    );


  /*
   * ICE que chegou ao host
   * antes do ANSWER.
   */

  const hostIceQueueRef =
    useRef<
      Map<
        string,
        RTCIceCandidateInit[]
      >
    >(
      new Map()
    );


  /*
   * Viewer possui somente
   * uma conexão com o host.
   */

  const viewerPeerRef =
    useRef<
      RTCPeerConnection | null
    >(
      null
    );


  /*
   * ICE que chegou ao viewer
   * antes da OFFER.
   */

  const viewerIceQueueRef =
    useRef<
      RTCIceCandidateInit[]
    >(
      []
    );


  /*
   * =========================================================
   * SINCRONIZAR REFS
   * =========================================================
   */

  useEffect(() => {
    activeSessionRef.current =
      activeSession;
  }, [
    activeSession,
  ]);


  useEffect(() => {
    currentUserIdRef.current =
      currentUserId;
  }, [
    currentUserId,
  ]);


  /*
   * =========================================================
   * FECHAR CONEXÕES DO HOST
   * =========================================================
   */

  const closeHostPeers =
    useCallback(
      () => {
        for (
          const peer
          of hostPeersRef
            .current
            .values()
        ) {
          peer.close();
        }


        hostPeersRef
          .current
          .clear();


        hostIceQueueRef
          .current
          .clear();


        setViewerCount(
          0
        );
      },
      []
    );


  /*
   * =========================================================
   * FECHAR CONEXÃO DO VIEWER
   * =========================================================
   */

  const closeViewerPeer =
    useCallback(
      () => {
        if (
          viewerPeerRef.current
        ) {
          viewerPeerRef.current
            .close();
        }


        viewerPeerRef.current =
          null;


        viewerIceQueueRef.current =
          [];


        setRemoteStream(
          null
        );


        setViewerState(
          "idle"
        );
      },
      []
    );


  /*
   * =========================================================
   * CARREGAR SESSÃO
   * =========================================================
   */

  const refreshSession =
    useCallback(
      async (
        silent =
          false
      ) => {
        if (
          !silent
        ) {
          setLoading(
            true
          );
        }


        try {
          const [
            sessionResult,
            permissionResult,
          ] =
            await Promise.all([
              supabase.rpc(
                "get_active_campfire_screen_session",
                {
                  p_campfire_id:
                    campfireId,
                }
              ),

              supabase.rpc(
                "can_current_user_share_screen",
                {
                  p_campfire_id:
                    campfireId,
                }
              ),
            ]);


          if (
            sessionResult.error
          ) {
            throw sessionResult
              .error;
          }


          if (
            permissionResult.error
          ) {
            throw permissionResult
              .error;
          }


          const rows =
            (
              sessionResult.data ??
              []
            ) as RawScreenSession[];


          const nextSession =
            rows.length >
            0
              ? mapSession(
                  rows[0]
                )
              : null;


          setActiveSession(
            nextSession
          );


          setCanShareScreen(
            permissionResult.data ===
              true
          );


          setError("");
        } catch (
          refreshError
        ) {
          console.error(
            "Erro carregando sessão de tela:",
            refreshError
          );


          setError(
            errorMessage(
              refreshError
            )
          );
        } finally {
          if (
            !silent
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        campfireId,
      ]
    );


  /*
   * =========================================================
   * AUTH
   * =========================================================
   */

  useEffect(() => {
    let cancelled =
      false;


    async function initialize() {
      const {
        data,
      } =
        await supabase.auth
          .getSession();


      if (
        cancelled
      ) {
        return;
      }


      setCurrentUserId(
        data.session
          ?.user.id ??
          null
      );


      await refreshSession();
    }


    void initialize();


    return () => {
      cancelled =
        true;
    };
  }, [
    refreshSession,
  ]);


  /*
   * =========================================================
   * REALTIME DA TABELA DE SESSÕES
   * =========================================================
   */

  useEffect(() => {
    /*
     * O Supabase Realtime atual reutiliza um canal existente
     * quando channel() recebe exatamente o mesmo tópico.
     *
     * Em React Strict Mode (ou numa remontagem rápida), o cleanup
     * anterior pode ainda estar removendo o canal quando este efeito
     * roda novamente. Se reutilizarmos o mesmo tópico, channel() pode
     * devolver o canal antigo já em "joining/joined"; nesse estado,
     * adicionar um novo listener postgres_changes lança uma exceção.
     *
     * O nome do tópico NÃO participa do filtro Postgres Changes.
     * Portanto, usamos um sufixo único por montagem para garantir
     * uma instância nova sem alterar a Campfire observada.
     */
    const realtimeMountId =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

    const topic =
      `campfire-screen-db-${campfireId}-${realtimeMountId}`;

    const channel =
      supabase.channel(
        topic
      );

    let disposed =
      false;

    channel.on(
      "postgres_changes",

      {
        event:
          "*",

        schema:
          "public",

        table:
          "campfire_screen_sessions",

        filter:
          `campfire_id=eq.${campfireId}`,
      },

      () => {
        if (disposed) {
          return;
        }

        void refreshSession(
          true
        );
      }
    );

    channel.subscribe(
      (
        status,
        subscribeError
      ) => {
        if (disposed) {
          return;
        }

        if (
          status ===
            "CHANNEL_ERROR" ||
          status ===
            "TIMED_OUT"
        ) {
          console.error(
            `Erro no Realtime da Campfire (${topic}):`,
            subscribeError
          );
        }
      }
    );


    return () => {
      disposed =
        true;

      void supabase
        .removeChannel(
          channel
        )
        .catch(
          (removeError) => {
            console.warn(
              `Não foi possível remover o canal ${topic}:`,
              removeError
            );
          }
        );
    };
  }, [
    campfireId,
    refreshSession,
  ]);


  /*
   * =========================================================
   * CANAL WEBRTC
   * =========================================================
   */

  useEffect(() => {
    if (
      !currentUserId
    ) {
      return;
    }


    /*
     * O efeito só continua quando currentUserId existe.
     *
     * Guardamos esse valor em uma constante local do tipo string
     * para que callbacks assíncronos/eventos WebRTC não voltem a
     * enxergá-lo como "string | null".
     */
    const signalingUserId =
      currentUserId;


    const topic =
      `campfire-webrtc:${campfireId}`;


    const channel =
      supabase.channel(
        topic,
        {
          config: {
            private:
              true,
          },
        }
      );


    channelRef.current =
      channel;


    /*
     * =======================================================
     * ENVIAR SINAL
     * =======================================================
     */

    async function sendSignal(
      signal:
        WebRTCSignal
    ) {
      const result =
        await channel.send({
          type:
            "broadcast",

          event:
            "signal",

          payload:
            signal,
        });


      if (
        result !==
        "ok"
      ) {
        console.warn(
          "Falha enviando sinal WebRTC:",
          result,
          signal.kind
        );
      }
    }


    /*
     * =======================================================
     * CRIAR PEER NO HOST
     * =======================================================
     */

    async function createHostPeer(
      viewerId:
        string,

      session:
        CampfireScreenSession
    ) {
      const localStream =
        localStreamRef.current;


      if (
        !localStream
      ) {
        return;
      }


      /*
       * Se o viewer estiver
       * reconectando, remove o peer
       * anterior.
       */

      const oldPeer =
        hostPeersRef
          .current
          .get(
            viewerId
          );


      if (
        oldPeer
      ) {
        oldPeer.close();
      }


      const peer =
        new RTCPeerConnection(
          RTC_CONFIGURATION
        );


      hostPeersRef
        .current
        .set(
          viewerId,
          peer
        );


      setViewerCount(
        hostPeersRef
          .current
          .size
      );


      /*
       * Vídeo + áudio.
       */

      for (
        const track
        of localStream.getTracks()
      ) {
        peer.addTrack(
          track,
          localStream
        );
      }


      /*
       * ICE DO HOST
       */

      peer.onicecandidate =
        (
          event
        ) => {
          if (
            !event.candidate
          ) {
            return;
          }


          void sendSignal({
            kind:
              "ice",

            sessionId:
              session.id,

            fromId:
              signalingUserId,

            toId:
              viewerId,

            candidate:
              event.candidate
                .toJSON(),
          });
        };


      /*
       * ESTADO
       */

      peer.onconnectionstatechange =
        () => {
          console.log(
            `🔥 Host → ${viewerId}:`,
            peer.connectionState
          );


          if (
            peer.connectionState ===
              "failed" ||
            peer.connectionState ===
              "closed"
          ) {
            peer.close();


            hostPeersRef
              .current
              .delete(
                viewerId
              );


            hostIceQueueRef
              .current
              .delete(
                viewerId
              );


            setViewerCount(
              hostPeersRef
                .current
                .size
            );
          }
        };


      /*
       * OFFER
       */

      const offer =
        await peer
          .createOffer();


      await peer
        .setLocalDescription(
          offer
        );


      if (
        !peer.localDescription
      ) {
        return;
      }


      await sendSignal({
        kind:
          "offer",

        sessionId:
          session.id,

        hostId:
          signalingUserId,

        viewerId,

        description: {
          type:
            peer.localDescription
              .type,

          sdp:
            peer.localDescription
              .sdp,
        },
      });
    }


    /*
     * =======================================================
     * CRIAR PEER NO VIEWER
     * =======================================================
     */

    function createViewerPeer(
      hostId:
        string,

      sessionId:
        string
    ) {
      if (
        viewerPeerRef.current
      ) {
        viewerPeerRef.current
          .close();
      }


      const peer =
        new RTCPeerConnection(
          RTC_CONFIGURATION
        );


      viewerPeerRef.current =
        peer;


      /*
       * ICE DO VIEWER
       */

      peer.onicecandidate =
        (
          event
        ) => {
          if (
            !event.candidate
          ) {
            return;
          }


          void sendSignal({
            kind:
              "ice",

            sessionId,

            fromId:
              signalingUserId,

            toId:
              hostId,

            candidate:
              event.candidate
                .toJSON(),
          });
        };


      /*
       * RECEBER VÍDEO/ÁUDIO
       */

      peer.ontrack =
        (
          event
        ) => {
          const stream =
            event.streams[0];


          if (
            stream
          ) {
            setRemoteStream(
              stream
            );

            return;
          }


          /*
           * Fallback.
           */

          setRemoteStream(
            (
              existing
            ) => {
              const next =
                existing ??
                new MediaStream();


              const alreadyHasTrack =
                next
                  .getTracks()
                  .some(
                    (
                      track
                    ) =>
                      track.id ===
                      event.track.id
                  );


              if (
                !alreadyHasTrack
              ) {
                next.addTrack(
                  event.track
                );
              }


              return next;
            }
          );
        };


      /*
       * ESTADO DO VIEWER
       */

      peer.onconnectionstatechange =
        () => {
          console.log(
            "🔥 Viewer WebRTC:",
            peer.connectionState
          );


          switch (
            peer.connectionState
          ) {
            case "new":

            case "connecting":
              setViewerState(
                "connecting"
              );

              break;


            case "connected":
              setViewerState(
                "connected"
              );

              break;


            case "disconnected":
              setViewerState(
                "disconnected"
              );

              break;


            case "failed":
              setViewerState(
                "failed"
              );

              break;


            case "closed":
              setViewerState(
                "idle"
              );

              break;
          }
        };


      return peer;
    }


    /*
     * =======================================================
     * RECEBER BROADCAST
     * =======================================================
     */

    channel.on(
      "broadcast",

      {
        event:
          "signal",
      },

      async (
        message
      ) => {
        /*
         * Esta construção substitui:
         *
         * message.payload
         * as WebRTCSignal
         *
         * e evita exatamente o erro
         * de parser que apareceu.
         */

        const signal =
          message.payload as unknown;


        if (
          !isWebRTCSignal(
            signal
          )
        ) {
          return;
        }


        const session =
          activeSessionRef
            .current;


        /*
         * ===================================================
         * VIEWER QUER ENTRAR
         * ===================================================
         */

        if (
          signal.kind ===
          "viewer-join"
        ) {
          if (
            !session ||
            session.id !==
              signal.sessionId ||
            session.hostId !==
              currentUserId
          ) {
            return;
          }


          try {
            await createHostPeer(
              signal.viewerId,
              session
            );
          } catch (
            hostError
          ) {
            console.error(
              "Erro criando peer do espectador:",
              hostError
            );
          }


          return;
        }


        /*
         * ===================================================
         * VIEWER SAIU
         * ===================================================
         */

        if (
          signal.kind ===
          "viewer-leave"
        ) {
          if (
            signal.hostId !==
            currentUserId
          ) {
            return;
          }


          const peer =
            hostPeersRef
              .current
              .get(
                signal.viewerId
              );


          peer?.close();


          hostPeersRef
            .current
            .delete(
              signal.viewerId
            );


          hostIceQueueRef
            .current
            .delete(
              signal.viewerId
            );


          setViewerCount(
            hostPeersRef
              .current
              .size
          );


          return;
        }


        /*
         * ===================================================
         * OFFER → VIEWER
         * ===================================================
         */

        if (
          signal.kind ===
          "offer"
        ) {
          if (
            signal.viewerId !==
            currentUserId
          ) {
            return;
          }


          try {
            setViewerState(
              "connecting"
            );


            const peer =
              createViewerPeer(
                signal.hostId,
                signal.sessionId
              );


            await peer
              .setRemoteDescription(
                signal.description
              );


            /*
             * ICE QUE CHEGOU
             * ANTES DA OFFER.
             */

            const queued =
              viewerIceQueueRef
                .current;


            viewerIceQueueRef.current =
              [];


            for (
              const candidate
              of queued
            ) {
              await peer
                .addIceCandidate(
                  candidate
                );
            }


            /*
             * ANSWER
             */

            const answer =
              await peer
                .createAnswer();


            await peer
              .setLocalDescription(
                answer
              );


            if (
              !peer.localDescription
            ) {
              return;
            }


            await sendSignal({
              kind:
                "answer",

              sessionId:
                signal.sessionId,

              hostId:
                signal.hostId,

              viewerId:
                currentUserId,

              description: {
                type:
                  peer.localDescription
                    .type,

                sdp:
                  peer.localDescription
                    .sdp,
              },
            });
          } catch (
            offerError
          ) {
            console.error(
              "Erro processando OFFER:",
              offerError
            );


            setViewerState(
              "failed"
            );
          }


          return;
        }


        /*
         * ===================================================
         * ANSWER → HOST
         * ===================================================
         */

        if (
          signal.kind ===
          "answer"
        ) {
          if (
            signal.hostId !==
            currentUserId
          ) {
            return;
          }


          const peer =
            hostPeersRef
              .current
              .get(
                signal.viewerId
              );


          if (
            !peer
          ) {
            return;
          }


          try {
            await peer
              .setRemoteDescription(
                signal.description
              );


            const queued =
              hostIceQueueRef
                .current
                .get(
                  signal.viewerId
                ) ??
              [];


            hostIceQueueRef
              .current
              .delete(
                signal.viewerId
              );


            for (
              const candidate
              of queued
            ) {
              await peer
                .addIceCandidate(
                  candidate
                );
            }
          } catch (
            answerError
          ) {
            console.error(
              "Erro processando ANSWER:",
              answerError
            );
          }


          return;
        }


        /*
         * ===================================================
         * ICE
         * ===================================================
         */

        if (
          signal.kind ===
          "ice"
        ) {
          if (
            signal.toId !==
            currentUserId
          ) {
            return;
          }


          /*
           * ICE CHEGANDO NO HOST
           */

          if (
            session &&
            session.hostId ===
              currentUserId
          ) {
            const peer =
              hostPeersRef
                .current
                .get(
                  signal.fromId
                );


            if (
              peer &&
              peer.remoteDescription
            ) {
              try {
                await peer
                  .addIceCandidate(
                    signal.candidate
                  );
              } catch (
                iceError
              ) {
                console.error(
                  "Erro ICE host:",
                  iceError
                );
              }
            } else {
              const current =
                hostIceQueueRef
                  .current
                  .get(
                    signal.fromId
                  ) ??
                [];


              current.push(
                signal.candidate
              );


              hostIceQueueRef
                .current
                .set(
                  signal.fromId,
                  current
                );
            }


            return;
          }


          /*
           * ICE CHEGANDO NO VIEWER
           */

          const peer =
            viewerPeerRef.current;


          if (
            peer &&
            peer.remoteDescription
          ) {
            try {
              await peer
                .addIceCandidate(
                  signal.candidate
                );
            } catch (
              iceError
            ) {
              console.error(
                "Erro ICE viewer:",
                iceError
              );
            }
          } else {
            viewerIceQueueRef
              .current
              .push(
                signal.candidate
              );
          }


          return;
        }


        /*
         * ===================================================
         * HOST ENCERROU
         * ===================================================
         */

        if (
          signal.kind ===
          "host-stop"
        ) {
          const current =
            activeSessionRef
              .current;


          if (
            current?.id !==
            signal.sessionId
          ) {
            return;
          }


          closeViewerPeer();


          void refreshSession(
            true
          );
        }
      }
    );


    /*
     * =======================================================
     * SUBSCRIBE
     * =======================================================
     */

    channel.subscribe(
      (
        status,
        subscribeError
      ) => {
        if (
          status ===
          "SUBSCRIBED"
        ) {
          console.log(
            `🔥 WebRTC privado conectado: ${topic}`
          );


          setSignalingReady(
            true
          );


          return;
        }


        if (
          status ===
            "CHANNEL_ERROR" ||
          status ===
            "TIMED_OUT"
        ) {
          console.error(
            "Erro no canal WebRTC:",
            subscribeError
          );


          setSignalingReady(
            false
          );
        }


        if (
          status ===
          "CLOSED"
        ) {
          setSignalingReady(
            false
          );
        }
      }
    );


    /*
     * =======================================================
     * CLEANUP DO CANAL
     * =======================================================
     */

    return () => {
      setSignalingReady(
        false
      );


      if (
        channelRef.current ===
        channel
      ) {
        channelRef.current =
          null;
      }


      closeHostPeers();

      closeViewerPeer();


      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    campfireId,
    currentUserId,
    closeHostPeers,
    closeViewerPeer,
    refreshSession,
  ]);


  /*
   * =========================================================
   * BROADCAST EXTERNO
   * =========================================================
   */

  const broadcastSignal =
    useCallback(
      async (
        signal:
          WebRTCSignal
      ) => {
        const channel =
          channelRef.current;


        if (
          !channel
        ) {
          throw new Error(
            "O canal WebRTC ainda não está conectado."
          );
        }


        const result =
          await channel.send({
            type:
              "broadcast",

            event:
              "signal",

            payload:
              signal,
          });


        if (
          result !==
          "ok"
        ) {
          throw new Error(
            `Falha na sinalização WebRTC: ${result}`
          );
        }
      },
      []
    );


  /*
   * =========================================================
   * HOST: INICIAR
   * =========================================================
   */

  async function startHosting(
    stream:
      MediaStream,

    title =
      "Compartilhamento de tela"
  ): Promise<
    WebRTCActionResult
  > {
    if (
      !canShareScreen
    ) {
      return {
        ok:
          false,

        message:
          "Você não possui permissão para compartilhar nesta Campfire.",
      };
    }


    if (
      activeSessionRef.current
    ) {
      return {
        ok:
          false,

        message:
          "Já existe uma transmissão ativa.",
      };
    }


    /*
     * Guarda o stream antes da RPC.
     */

    localStreamRef.current =
      stream;


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "start_campfire_screen_session",
          {
            p_campfire_id:
              campfireId,

            p_session_type:
              "screen",

            p_title:
              title,

            p_metadata:
              {},
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      if (
        typeof data !==
        "string"
      ) {
        throw new Error(
          "O banco não retornou o ID da transmissão."
        );
      }


      await refreshSession(
        true
      );


      return {
        ok:
          true,

        message:
          "Transmissão iniciada.",

        sessionId:
          data,
      };
    } catch (
      startError
    ) {
      localStreamRef.current =
        null;


      return {
        ok:
          false,

        message:
          errorMessage(
            startError
          ),
      };
    }
  }


  /*
   * =========================================================
   * HOST: ENCERRAR
   * =========================================================
   */

  async function stopHosting():
    Promise<
      WebRTCActionResult
    > {
    const session =
      activeSessionRef
        .current;


    const userId =
      currentUserIdRef
        .current;


    if (
      !session ||
      !userId ||
      session.hostId !==
        userId
    ) {
      return {
        ok:
          false,

        message:
          "Você não é o apresentador desta transmissão.",
      };
    }


    try {
      /*
       * Primeiro avisa viewers.
       */

      if (
        signalingReady
      ) {
        await broadcastSignal({
          kind:
            "host-stop",

          sessionId:
            session.id,

          hostId:
            userId,
        });
      }


      /*
       * Depois encerra no banco.
       */

      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "stop_campfire_screen_session",
          {
            p_session_id:
              session.id,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      closeHostPeers();


      localStreamRef.current =
        null;


      await refreshSession(
        true
      );


      return {
        ok:
          true,

        message:
          "Transmissão encerrada.",
      };
    } catch (
      stopError
    ) {
      return {
        ok:
          false,

        message:
          errorMessage(
            stopError
          ),
      };
    }
  }


  /*
   * =========================================================
   * VIEWER: ENTRAR
   * =========================================================
   */

  async function joinViewing():
    Promise<
      WebRTCActionResult
    > {
    const session =
      activeSessionRef
        .current;


    const userId =
      currentUserIdRef
        .current;


    if (
      !session ||
      !userId
    ) {
      return {
        ok:
          false,

        message:
          "Não existe uma transmissão ativa.",
      };
    }


    if (
      session.hostId ===
      userId
    ) {
      return {
        ok:
          false,

        message:
          "Você é o apresentador.",
      };
    }


    if (
      !signalingReady
    ) {
      return {
        ok:
          false,

        message:
          "O canal da transmissão ainda está conectando.",
      };
    }


    try {
      /*
       * Remove tentativa anterior,
       * se houver.
       */

      closeViewerPeer();


      setViewerState(
        "waiting"
      );


      await broadcastSignal({
        kind:
          "viewer-join",

        sessionId:
          session.id,

        viewerId:
          userId,
      });


      return {
        ok:
          true,

        message:
          "Solicitação enviada ao apresentador.",
      };
    } catch (
      joinError
    ) {
      setViewerState(
        "failed"
      );


      return {
        ok:
          false,

        message:
          errorMessage(
            joinError
          ),
      };
    }
  }


  /*
   * =========================================================
   * VIEWER: SAIR
   * =========================================================
   */

  async function leaveViewing():
    Promise<void> {
    const session =
      activeSessionRef
        .current;


    const userId =
      currentUserIdRef
        .current;


    if (
      session &&
      userId &&
      session.hostId !==
        userId &&
      signalingReady
    ) {
      try {
        await broadcastSignal({
          kind:
            "viewer-leave",

          sessionId:
            session.id,

          viewerId:
            userId,

          hostId:
            session.hostId,
        });
      } catch (
        leaveError
      ) {
        console.warn(
          "Não foi possível avisar a saída do viewer:",
          leaveError
        );
      }
    }


    closeViewerPeer();
  }


  /*
   * =========================================================
   * SESSÃO DESAPARECEU
   * =========================================================
   */

  useEffect(() => {
    if (
      activeSession
    ) {
      return;
    }


    closeHostPeers();

    closeViewerPeer();


    localStreamRef.current =
      null;
  }, [
    activeSession,
    closeHostPeers,
    closeViewerPeer,
  ]);


  /*
   * =========================================================
   * CLEANUP FINAL
   * =========================================================
   */

  useEffect(() => {
    return () => {
      closeHostPeers();

      closeViewerPeer();


      localStreamRef.current =
        null;
    };
  }, [
    closeHostPeers,
    closeViewerPeer,
  ]);


  /*
   * =========================================================
   * API DO HOOK
   * =========================================================
   */

  return {
    currentUserId,

    activeSession,

    canShareScreen,

    loading,

    error,

    signalingReady,

    viewerState,

    remoteStream,

    viewerCount,

    refreshSession,

    startHosting,

    stopHosting,

    joinViewing,

    leaveViewing,
  };
}