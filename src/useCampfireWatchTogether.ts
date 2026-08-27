import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "./lib/supabase";


export type WatchProvider =
  | "youtube"
  | "html5";


export type WatchPlaybackState =
  | "paused"
  | "playing";


export type CampfireWatchSession = {
  id: string;

  campfire_id: string;

  provider: WatchProvider;

  media_id: string | null;

  media_url: string | null;

  anime_id: string | null;

  anime_title: string;

  anime_cover: string | null;

  episode_label: string | null;

  playback_state: WatchPlaybackState;

  position_seconds: number;

  playback_rate: number;

  version: number;

  started_by: string;

  updated_by: string;

  created_at: string;

  state_updated_at: string;
};


export type StartWatchInput = {
  provider: WatchProvider;

  mediaId?: string | null;

  mediaUrl?: string | null;

  animeId?: string | null;

  animeTitle: string;

  animeCover?: string | null;

  episodeLabel?: string | null;
};


export type WatchActionResult = {
  ok: boolean;

  message: string;
};


function watchErrorMessage(
  error: unknown
): string {
  let message = "";

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    message = String(
      (
        error as {
          message?: unknown;
        }
      ).message ?? ""
    );
  }


  const upper =
    message.toUpperCase();


  if (
    upper.includes(
      "NOT_CAMPFIRE_LEADER"
    )
  ) {
    return "Somente o líder atual pode controlar o Watch Together.";
  }


  if (
    upper.includes(
      "NO_ACTIVE_WATCH_SESSION"
    )
  ) {
    return "Não existe uma exibição ativa nesta Campfire.";
  }


  if (
    upper.includes(
      "YOUTUBE_VIDEO_ID_REQUIRED"
    )
  ) {
    return "O vídeo do YouTube não foi identificado.";
  }


  if (
    upper.includes(
      "MEDIA_URL_REQUIRED"
    )
  ) {
    return "A URL do vídeo é obrigatória.";
  }


  if (
    upper.includes(
      "UNSUPPORTED_WATCH_PROVIDER"
    )
  ) {
    return "Esse tipo de player ainda não é suportado pelo Campfire.";
  }


  if (
    upper.includes(
      "NOT_ACTIVE_CAMPFIRE_MEMBER"
    )
  ) {
    return "Você não está mais dentro desta Campfire.";
  }


  if (
    upper.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return "Sua sessão expirou. Entre novamente no Campfire.";
  }


  return (
    message ||
    "Não foi possível executar a operação."
  );
}


function firstSession(
  data: unknown
): CampfireWatchSession | null {
  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {
    return null;
  }

  return (
    data[0] as CampfireWatchSession
  );
}


/*
 * Retorna a posição que o grupo
 * deveria estar assistindo neste instante.
 */
export function getEstimatedWatchPosition(
  session: CampfireWatchSession,
  now = Date.now()
): number {
  if (
    session.playback_state ===
    "paused"
  ) {
    return Math.max(
      0,
      session.position_seconds
    );
  }


  const updatedAt =
    Date.parse(
      session.state_updated_at
    );


  if (
    !Number.isFinite(updatedAt)
  ) {
    return Math.max(
      0,
      session.position_seconds
    );
  }


  const elapsedSeconds =
    Math.max(
      0,
      now - updatedAt
    ) /
    1000;


  return Math.max(
    0,

    session.position_seconds +
      elapsedSeconds *
        session.playback_rate
  );
}


export function useCampfireWatchTogether(
  campfireId: string
) {
  const [
    session,
    setSession,
  ] =
    useState<
      CampfireWatchSession | null
    >(null);


  const [
    isLeader,
    setIsLeader,
  ] =
    useState(false);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    busy,
    setBusy,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  /*
   * =========================================================
   * CARREGAR SESSÃO ATIVA
   * =========================================================
   */

  const refreshSession =
    useCallback(
      async (
        silent = false
      ) => {
        if (!silent) {
          setLoading(true);
        }


        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            "get_active_watch_session",
            {
              p_campfire_id:
                campfireId,
            }
          );


        if (rpcError) {
          console.error(
            "Erro carregando Watch Together:",
            rpcError
          );

          setError(
            watchErrorMessage(
              rpcError
            )
          );

          if (!silent) {
            setLoading(false);
          }

          return;
        }


        setSession(
          firstSession(data)
        );

        setError("");


        if (!silent) {
          setLoading(false);
        }
      },
      [
        campfireId,
      ]
    );


  /*
   * =========================================================
   * VERIFICAR LÍDER
   * =========================================================
   */

  const refreshLeadership =
    useCallback(
      async () => {
        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            "is_current_campfire_leader",
            {
              p_campfire_id:
                campfireId,
            }
          );


        if (rpcError) {
          console.error(
            "Erro verificando liderança:",
            rpcError
          );

          setIsLeader(false);

          return;
        }


        setIsLeader(
          data === true
        );
      },
      [
        campfireId,
      ]
    );


  /*
   * =========================================================
   * REALTIME
   * =========================================================
   */

  useEffect(() => {
    void refreshSession();
    void refreshLeadership();


    const channel =
      supabase
        .channel(
          `campfire-watch:${campfireId}`
        )

        /*
         * Sessão:
         * start / play / pause /
         * seek / stop / troca.
         */
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "campfire_watch_sessions",
            filter:
              `campfire_id=eq.${campfireId}`,
          },
          () => {
            void refreshSession(
              true
            );
          }
        )

        /*
         * Se leader_id mudar,
         * recalculamos imediatamente
         * quem possui o controle.
         */
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "campfires",
            filter:
              `id=eq.${campfireId}`,
          },
          () => {
            void refreshLeadership();
          }
        )

        .subscribe();


    /*
     * Fallback para Alpha.
     */
    const fallbackTimer =
      window.setInterval(
        () => {
          void refreshSession(
            true
          );

          void refreshLeadership();
        },

        15000
      );


    return () => {
      window.clearInterval(
        fallbackTimer
      );

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    campfireId,
    refreshLeadership,
    refreshSession,
  ]);


  /*
   * =========================================================
   * START
   * =========================================================
   */

  async function startWatch(
    input: StartWatchInput
  ): Promise<WatchActionResult> {
    if (busy) {
      return {
        ok: false,
        message:
          "Aguarde a operação atual terminar.",
      };
    }


    if (!isLeader) {
      return {
        ok: false,
        message:
          "Somente o líder pode iniciar o Watch Together.",
      };
    }


    setBusy(true);
    setError("");


    try {
      const {
        error: rpcError,
      } =
        await supabase.rpc(
          "start_campfire_watch",
          {
            p_campfire_id:
              campfireId,

            p_provider:
              input.provider,

            p_media_id:
              input.mediaId ??
              null,

            p_media_url:
              input.mediaUrl ??
              null,

            p_anime_id:
              input.animeId ??
              null,

            p_anime_title:
              input.animeTitle,

            p_anime_cover:
              input.animeCover ??
              null,

            p_episode_label:
              input.episodeLabel ??
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      await refreshSession(
        true
      );


      return {
        ok: true,
        message:
          "🔥 Watch Together iniciado.",
      };
    } catch (startError) {
      console.error(
        "Erro iniciando Watch Together:",
        startError
      );


      const message =
        watchErrorMessage(
          startError
        );


      setError(message);


      return {
        ok: false,
        message,
      };
    } finally {
      setBusy(false);
    }
  }


  /*
   * =========================================================
   * PLAY / PAUSE / SEEK
   * =========================================================
   */

  async function controlWatch(
    playbackState:
      WatchPlaybackState,

    positionSeconds: number
  ): Promise<WatchActionResult> {
    if (busy) {
      return {
        ok: false,
        message:
          "Aguarde a operação atual terminar.",
      };
    }


    if (!isLeader) {
      return {
        ok: false,
        message:
          "Somente o líder pode controlar a exibição.",
      };
    }


    const safePosition =
      Math.max(
        0,
        Number.isFinite(
          positionSeconds
        )
          ? positionSeconds
          : 0
      );


    setBusy(true);
    setError("");


    try {
      const {
        error: rpcError,
      } =
        await supabase.rpc(
          "control_campfire_watch",
          {
            p_campfire_id:
              campfireId,

            p_playback_state:
              playbackState,

            p_position_seconds:
              safePosition,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      await refreshSession(
        true
      );


      return {
        ok: true,
        message: "",
      };
    } catch (controlError) {
      console.error(
        "Erro controlando Watch Together:",
        controlError
      );


      const message =
        watchErrorMessage(
          controlError
        );


      setError(message);


      return {
        ok: false,
        message,
      };
    } finally {
      setBusy(false);
    }
  }


  /*
   * =========================================================
   * STOP
   * =========================================================
   */

  async function stopWatch():
    Promise<WatchActionResult> {
    if (busy) {
      return {
        ok: false,
        message:
          "Aguarde a operação atual terminar.",
      };
    }


    if (!isLeader) {
      return {
        ok: false,
        message:
          "Somente o líder pode encerrar a exibição.",
      };
    }


    setBusy(true);
    setError("");


    try {
      const {
        error: rpcError,
      } =
        await supabase.rpc(
          "stop_campfire_watch",
          {
            p_campfire_id:
              campfireId,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSession(null);


      return {
        ok: true,
        message:
          "A exibição foi encerrada.",
      };
    } catch (stopError) {
      console.error(
        "Erro encerrando Watch Together:",
        stopError
      );


      const message =
        watchErrorMessage(
          stopError
        );


      setError(message);


      return {
        ok: false,
        message,
      };
    } finally {
      setBusy(false);
    }
  }


  return {
    session,

    isLeader,

    loading,

    busy,

    error,

    refreshSession,

    refreshLeadership,

    startWatch,

    controlWatch,

    stopWatch,
  };
}