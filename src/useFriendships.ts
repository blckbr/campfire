import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "./lib/supabase";

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
};

export type FriendItem = {
  friendshipId: string;
  profile: PublicProfile;
};

export type FriendRequestItem = {
  friendshipId: string;
  profile: PublicProfile;
  createdAt: string;
};

export type FriendActionResult = {
  ok: boolean;
  message: string;
};

type RawFriendship = {
  id: string;

  requester_id: string;
  addressee_id: string;

  status:
    | "pending"
    | "accepted";

  created_at: string;

  requester:
    | PublicProfile
    | PublicProfile[]
    | null;

  addressee:
    | PublicProfile
    | PublicProfile[]
    | null;
};

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function getSingleProfile(
  value:
    | PublicProfile
    | PublicProfile[]
    | null
): PublicProfile | null {
  if (!value) {
    return null;
  }

  if (
    Array.isArray(value)
  ) {
    return (
      value[0] ??
      null
    );
  }

  return value;
}

function profileName(
  profile:
    PublicProfile
) {
  return (
    profile.display_name ||
    profile.username ||
    "Campfire User"
  );
}

function mapFriendError(
  error: unknown
): string {
  let message = "";

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
            message?: unknown;
          }
        ).message ??
          ""
      );
  }

  const normalized =
    message.toUpperCase();

  if (
    normalized.includes(
      "USER_NOT_FOUND"
    )
  ) {
    return (
      "Esse usuário não existe."
    );
  }

  if (
    normalized.includes(
      "CANNOT_ADD_SELF"
    )
  ) {
    return (
      "Você não pode adicionar a si mesmo."
    );
  }

  if (
    normalized.includes(
      "RELATIONSHIP_EXISTS"
    )
  ) {
    return (
      "Já existe um pedido ou amizade entre vocês."
    );
  }

  if (
    normalized.includes(
      "REQUEST_NOT_FOUND"
    )
  ) {
    return (
      "Esse pedido não existe mais."
    );
  }

  if (
    normalized.includes(
      "REQUEST_ALREADY_PROCESSED"
    )
  ) {
    return (
      "Esse pedido já foi respondido."
    );
  }

  if (
    normalized.includes(
      "NOT_ALLOWED"
    )
  ) {
    return (
      "Você não pode executar essa ação."
    );
  }

  if (
    normalized.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return (
      "Sua sessão expirou. Entre novamente."
    );
  }

  return (
    message ||
    "Não foi possível concluir a operação."
  );
}

/*
 * ============================================================
 * HOOK
 * ============================================================
 */

export function useFriendships(
  userId: string | null
) {
  const [
    friends,
    setFriends,
  ] =
    useState<
      FriendItem[]
    >([]);

  const [
    incomingRequests,
    setIncomingRequests,
  ] =
    useState<
      FriendRequestItem[]
    >([]);

  const [
    outgoingRequests,
    setOutgoingRequests,
  ] =
    useState<
      FriendRequestItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    realtimeConnected,
    setRealtimeConnected,
  ] =
    useState(false);

  /*
   * =========================================================
   * CARREGAR RELAÇÕES DO BANCO
   * =========================================================
   */

  const refresh =
    useCallback(
      async (
        silent = false
      ) => {
        if (!userId) {
          setFriends([]);

          setIncomingRequests(
            []
          );

          setOutgoingRequests(
            []
          );

          setError("");

          return;
        }

        if (!silent) {
          setLoading(
            true
          );
        }

        try {
          const {
            data,
            error:
              queryError,
          } =
            await supabase
              .from(
                "friendships"
              )
              .select(
                `
                  id,
                  requester_id,
                  addressee_id,
                  status,
                  created_at,

                  requester:profiles!friendships_requester_id_fkey (
                    id,
                    username,
                    display_name,
                    avatar_url,
                    status
                  ),

                  addressee:profiles!friendships_addressee_id_fkey (
                    id,
                    username,
                    display_name,
                    avatar_url,
                    status
                  )
                `
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              );

          if (
            queryError
          ) {
            throw queryError;
          }

          const rows =
            (
              data ??
              []
            ) as unknown as RawFriendship[];

          const nextFriends:
            FriendItem[] =
              [];

          const nextIncoming:
            FriendRequestItem[] =
              [];

          const nextOutgoing:
            FriendRequestItem[] =
              [];

          for (
            const row
            of rows
          ) {
            const requester =
              getSingleProfile(
                row.requester
              );

            const addressee =
              getSingleProfile(
                row.addressee
              );

            const isRequester =
              row.requester_id ===
              userId;

            const otherProfile =
              isRequester
                ? addressee
                : requester;

            if (
              !otherProfile
            ) {
              continue;
            }

            /*
             * -----------------------------------------------
             * AMIZADE ACEITA
             * -----------------------------------------------
             */

            if (
              row.status ===
              "accepted"
            ) {
              nextFriends.push(
                {
                  friendshipId:
                    row.id,

                  profile:
                    otherProfile,
                }
              );

              continue;
            }

            /*
             * -----------------------------------------------
             * PEDIDO RECEBIDO
             * -----------------------------------------------
             */

            if (
              row.status ===
                "pending" &&
              row.addressee_id ===
                userId
            ) {
              nextIncoming.push(
                {
                  friendshipId:
                    row.id,

                  profile:
                    otherProfile,

                  createdAt:
                    row.created_at,
                }
              );

              continue;
            }

            /*
             * -----------------------------------------------
             * PEDIDO ENVIADO
             * -----------------------------------------------
             */

            if (
              row.status ===
                "pending" &&
              row.requester_id ===
                userId
            ) {
              nextOutgoing.push(
                {
                  friendshipId:
                    row.id,

                  profile:
                    otherProfile,

                  createdAt:
                    row.created_at,
                }
              );
            }
          }

          /*
           * Ordena amigos
           * alfabeticamente.
           */

          nextFriends.sort(
            (
              a,
              b
            ) =>
              profileName(
                a.profile
              ).localeCompare(
                profileName(
                  b.profile
                ),
                "pt-BR"
              )
          );

          setFriends(
            nextFriends
          );

          setIncomingRequests(
            nextIncoming
          );

          setOutgoingRequests(
            nextOutgoing
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Erro carregando amizades:",
            loadError
          );

          setError(
            mapFriendError(
              loadError
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
        userId,
      ]
    );

  /*
   * =========================================================
   * CARREGAMENTO INICIAL
   * =========================================================
   */

  useEffect(() => {
    void refresh();
  }, [
    refresh,
  ]);

  /*
   * =========================================================
   * SUPABASE REALTIME
   * =========================================================
   *
   * INSERT:
   *
   * novo pedido de amizade
   *
   * UPDATE:
   *
   * pedido aceito
   *
   * Assim que o banco mudar,
   * recarregamos a lista.
   * =========================================================
   */

  useEffect(() => {
    if (
      !userId
    ) {
      setRealtimeConnected(
        false
      );

      return;
    }

    const channelName =
      `campfire-friendships-${userId}`;

    const channel =
      supabase
        .channel(
          channelName
        )

        /*
         * -----------------------------------------------
         * NOVO PEDIDO
         * -----------------------------------------------
         */

        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "friendships",
          },
          () => {
            console.log(
              "🔥 Novo evento de amizade recebido."
            );

            void refresh(
              true
            );
          }
        )

        /*
         * -----------------------------------------------
         * PEDIDO ACEITO
         * -----------------------------------------------
         */

        .on(
          "postgres_changes",
          {
            event:
              "UPDATE",

            schema:
              "public",

            table:
              "friendships",
          },
          () => {
            console.log(
              "🔥 Amizade atualizada em tempo real."
            );

            void refresh(
              true
            );
          }
        )

        /*
         * -----------------------------------------------
         * CONECTAR
         * -----------------------------------------------
         */

        .subscribe(
          (
            status
          ) => {
            if (
              status ===
              "SUBSCRIBED"
            ) {
              console.log(
                "🔥 Campfire Friends Realtime conectado."
              );

              setRealtimeConnected(
                true
              );

              return;
            }

            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT" ||
              status ===
                "CLOSED"
            ) {
              console.warn(
                "Campfire Friends Realtime:",
                status
              );

              setRealtimeConnected(
                false
              );
            }
          }
        );

    /*
     * -----------------------------------------------
     * CLEANUP
     * -----------------------------------------------
     *
     * Importante para não criar
     * canais duplicados quando
     * React desmontar o componente.
     */

    return () => {
      setRealtimeConnected(
        false
      );

      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    userId,
    refresh,
  ]);

  /*
   * =========================================================
   * FALLBACK
   * =========================================================
   *
   * INSERT e UPDATE chegam imediatamente.
   *
   * Para remoções/cancelamentos feitos pelo OUTRO usuário,
   * mantemos uma verificação bem mais espaçada.
   *
   * Não usamos DELETE Realtime aqui propositalmente.
   * =========================================================
   */

  useEffect(() => {
    if (
      !userId
    ) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          void refresh(
            true
          );
        },
        30000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    userId,
    refresh,
  ]);

  /*
   * =========================================================
   * ENVIAR PEDIDO
   * =========================================================
   */

  async function sendRequest(
    username:
      string
  ): Promise<FriendActionResult> {
    const cleanUsername =
      username
        .trim()
        .replace(
          /^@+/,
          ""
        )
        .toLowerCase();

    if (
      cleanUsername.length <
      3
    ) {
      return {
        ok: false,

        message:
          "Digite um username válido.",
      };
    }

    const incoming =
      incomingRequests.find(
        (
          request
        ) =>
          request.profile
            .username
            ?.toLowerCase() ===
          cleanUsername
      );

    if (
      incoming
    ) {
      return {
        ok: false,

        message:
          "Essa pessoa já enviou um pedido para você. Veja a aba Pedidos.",
      };
    }

    const existingFriend =
      friends.find(
        (
          friend
        ) =>
          friend.profile
            .username
            ?.toLowerCase() ===
          cleanUsername
      );

    if (
      existingFriend
    ) {
      return {
        ok: false,

        message:
          "Essa pessoa já é sua amiga.",
      };
    }

    const outgoing =
      outgoingRequests.find(
        (
          request
        ) =>
          request.profile
            .username
            ?.toLowerCase() ===
          cleanUsername
      );

    if (
      outgoing
    ) {
      return {
        ok: false,

        message:
          "Você já enviou um pedido para essa pessoa.",
      };
    }

    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "send_friend_request",
          {
            p_username:
              cleanUsername,
          }
        );

      if (
        rpcError
      ) {
        throw rpcError;
      }

      /*
       * Atualiza imediatamente
       * o próprio remetente.
       */

      await refresh(
        true
      );

      return {
        ok: true,

        message:
          `Pedido enviado para @${cleanUsername}.`,
      };
    } catch (
      sendError
    ) {
      console.error(
        "Erro enviando amizade:",
        sendError
      );

      return {
        ok: false,

        message:
          mapFriendError(
            sendError
          ),
      };
    }
  }

  /*
   * =========================================================
   * ACEITAR / RECUSAR
   * =========================================================
   */

  async function respondRequest(
    friendshipId:
      string,

    accept:
      boolean
  ): Promise<FriendActionResult> {
    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "respond_friend_request",
          {
            p_request_id:
              friendshipId,

            p_accept:
              accept,
          }
        );

      if (
        rpcError
      ) {
        throw rpcError;
      }

      await refresh(
        true
      );

      return {
        ok: true,

        message:
          accept
            ? "Pedido aceito. Vocês agora são amigos."
            : "Pedido recusado.",
      };
    } catch (
      respondError
    ) {
      console.error(
        "Erro respondendo amizade:",
        respondError
      );

      return {
        ok: false,

        message:
          mapFriendError(
            respondError
          ),
      };
    }
  }

  /*
   * =========================================================
   * CANCELAR PEDIDO
   * =========================================================
   */

  async function cancelRequest(
    friendshipId:
      string
  ): Promise<FriendActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "cancel_friend_request",
          {
            p_request_id:
              friendshipId,
          }
        );

      if (
        rpcError
      ) {
        throw rpcError;
      }

      if (
        !data
      ) {
        throw new Error(
          "O pedido não pôde ser cancelado."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,

        message:
          "Pedido cancelado.",
      };
    } catch (
      cancelError
    ) {
      console.error(
        "Erro cancelando pedido:",
        cancelError
      );

      return {
        ok: false,

        message:
          mapFriendError(
            cancelError
          ),
      };
    }
  }

  /*
   * =========================================================
   * REMOVER AMIGO
   * =========================================================
   */

  async function removeFriend(
    friendshipId:
      string
  ): Promise<FriendActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "remove_friend",
          {
            p_friendship_id:
              friendshipId,
          }
        );

      if (
        rpcError
      ) {
        throw rpcError;
      }

      if (
        !data
      ) {
        throw new Error(
          "A amizade não pôde ser removida."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,

        message:
          "Amigo removido.",
      };
    } catch (
      removeError
    ) {
      console.error(
        "Erro removendo amigo:",
        removeError
      );

      return {
        ok: false,

        message:
          mapFriendError(
            removeError
          ),
      };
    }
  }

  /*
   * =========================================================
   * RESULTADO
   * =========================================================
   */

  return {
    friends,

    incomingRequests,

    outgoingRequests,

    loading,

    error,

    realtimeConnected,

    refresh,

    sendRequest,

    respondRequest,

    cancelRequest,

    removeFriend,
  };
}