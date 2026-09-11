import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  supabase,
} from "./lib/supabase";

import {
  playCampfireNotificationChime,
  showCampfireSystemNotification,
} from "./campfireAppPreferences";

type UseCampfireRoomEventsOptions = {
  campfireId: string | null;
  messagesTabActive: boolean;
  roomName?: string;
  currentUserId?: string;
};

export function useCampfireRoomEvents({
  campfireId,
  messagesTabActive,
  roomName = "Campfire",
  currentUserId,
}: UseCampfireRoomEventsOptions) {
  const [
    unreadMessages,
    setUnreadMessages,
  ] =
    useState(0);

  /*
   * Precisamos saber qual aba está
   * aberta dentro do callback Realtime
   * sem recriar o canal a cada clique.
   */
  const messagesTabActiveRef =
    useRef(
      messagesTabActive
    );

  useEffect(() => {
    messagesTabActiveRef.current =
      messagesTabActive;

    /*
     * Ao abrir Mensagens,
     * tudo é considerado lido.
     */
    if (
      messagesTabActive
    ) {
      setUnreadMessages(
        0
      );
    }
  }, [
    messagesTabActive,
  ]);

  /*
   * Ao trocar de Campfire,
   * zeramos o contador.
   */
  useEffect(() => {
    setUnreadMessages(
      0
    );
  }, [
    campfireId,
    currentUserId,
    roomName,
  ]);

  const markMessagesRead =
    useCallback(
      () => {
        setUnreadMessages(
          0
        );
      },
      []
    );

  /*
   * =========================================================
   * LISTENER GLOBAL DA CAMPFIRE
   * =========================================================
   *
   * Esse listener permanece ativo mesmo
   * quando a aba Mensagens não está visível.
   * =========================================================
   */

  useEffect(() => {
    if (
      !campfireId
    ) {
      return;
    }

    const channel =
      supabase
        .channel(
          `campfire-room-events-${campfireId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )

        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "campfire_messages",

            filter:
              `campfire_id=eq.${campfireId}`,
          },
          (payload) => {
            const inserted = payload.new as { sender_id?: string | null; content?: string | null };
            if (currentUserId && inserted.sender_id === currentUserId) {
              return;
            }

            /*
             * Se a pessoa JÁ está olhando
             * Mensagens, não criamos unread.
             */
            if (
              messagesTabActiveRef
                .current
            ) {
              return;
            }

            /*
             * Qualquer tipo conta:
             *
             * texto
             * GIF
             * Wink
             * áudio
             * sistema
             */
            setUnreadMessages(
              (
                current
              ) =>
                Math.min(
                  current +
                    1,
                  999
                )
            );

            playCampfireNotificationChime();
            showCampfireSystemNotification(
              `Nova mensagem em ${roomName}`,
              inserted.content?.trim() || "Você recebeu uma nova mensagem no Campfire."
            );
          }
        )

        .subscribe(
          (
            status
          ) => {
            if (
              status ===
              "SUBSCRIBED"
            ) {
              console.log(
                `🔥 Eventos da Campfire conectados: ${campfireId}`
              );
            }

            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT"
            ) {
              console.warn(
                "Realtime da sala temporariamente indisponível:",
                status
              );
            }
          }
        );

    return () => {
      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    campfireId,
  ]);

  return {
    unreadMessages,

    hasUnreadMessages:
      unreadMessages >
      0,

    markMessagesRead,
  };
}