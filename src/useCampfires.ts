import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "./lib/supabase";

export type CampfirePrivacy =
  | "private"
  | "friends"
  | "link";

export type CampfireState =
  | "active"
  | "away"
  | "invited";

export type CampfireCoverKind =
  | "preset"
  | "storage"
  | "web";

export type CampfireLifecycleType =
  | "temporary"
  | "permanent";

export type CreateCampfireInput = {
  name: string;
  privacy: CampfirePrivacy;
  inviteeIds: string[];
  lifecycle: CampfireLifecycleType;
  coverKind: CampfireCoverKind;
  coverRef: string;
};

export type CampfireRosterMember = {
  id: string;
  username: string | null;
  isOwner: boolean;
  isLeader: boolean;
};

export type CampfireItem = {
  id: string;
  name: string;
  ownerId: string;
  privacy: CampfirePrivacy;
  persistent: boolean;
  lifecycle: CampfireLifecycleType;
  coverKind: CampfireCoverKind;
  coverRef: string;
  inviteCode: string;
  createdAt: string;
  emptySince: string | null;
  expiresAt: string | null;
  activePeople: number;
  members: CampfireRosterMember[];
  myState: CampfireState;
  inviteId: string | null;
};

export type CampfireActionResult = {
  ok: boolean;
  message: string;
  campfireId?: string;
};

type RawCampfire = {
  id: string;
  name: string;
  owner_id: string;
  privacy: CampfirePrivacy;
  persistent: boolean;
  invite_code: string;
  created_at: string;
  empty_since: string | null;
  expires_at: string | null;
  active_people: number | string;
  my_state: CampfireState;
};

type RawCampfireVisual = {
  campfire_id: string;
  cover_kind: CampfireCoverKind | null;
  cover_ref: string | null;
};

type RawInvite = {
  id: string;
  campfire_id: string;
};

type RawCampfireMember = {
  id: string;
  username: string | null;
  is_owner: boolean;
  is_leader: boolean;
};

function mapCampfireError(
  error: unknown
): string {
  let message = "";

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    message =
      String(
        (
          error as {
            message?: unknown;
          }
        ).message ?? ""
      );
  }

  const normalized =
    message.toUpperCase();

  if (
    normalized.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return "Sua sessão expirou.";
  }

  if (
    normalized.includes(
      "INVALID_CAMPFIRE_NAME"
    )
  ) {
    return "O nome da Campfire deve ter entre 1 e 40 caracteres.";
  }

  if (
    normalized.includes(
      "INVALID_PRIVACY"
    )
  ) {
    return "Privacidade inválida.";
  }

  if (
    normalized.includes(
      "CANNOT_INVITE_SELF"
    )
  ) {
    return "Você não pode convidar a si mesmo.";
  }

  if (
    normalized.includes(
      "NOT_FRIEND"
    )
  ) {
    return "Um dos usuários selecionados não é mais seu amigo.";
  }

  if (
    normalized.includes(
      "INVITE_NOT_FOUND"
    )
  ) {
    return "Esse convite não existe mais.";
  }

  if (
    normalized.includes(
      "INVITE_ALREADY_PROCESSED"
    )
  ) {
    return "Esse convite já foi respondido.";
  }

  if (
    normalized.includes(
      "CAMPFIRE_NOT_FOUND"
    )
  ) {
    return "Essa Campfire não existe mais.";
  }

  if (
    normalized.includes(
      "CAMPFIRE_EXPIRED"
    )
  ) {
    return "Essa Campfire já se apagou.";
  }

  if (
    normalized.includes(
      "OWNER_TRANSFER_REQUIRED"
    )
  ) {
    return "Transfira a propriedade da Campfire para outro membro antes de sair.";
  }

  if (
    normalized.includes(
      "NOT_MEMBER"
    )
  ) {
    return "Você não está nessa Campfire.";
  }

  if (
    normalized.includes(
      "NOT_ALLOWED"
    )
  ) {
    return "Você não tem acesso a essa Campfire.";
  }

  return (
    message ||
    "Não foi possível concluir a operação."
  );
}

export function useCampfires(
  userId: string | null
) {
  const [
    campfires,
    setCampfires,
  ] =
    useState<CampfireItem[]>(
      []
    );

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
   * CARREGAR CAMPFIRES
   * =========================================================
   */

  const refresh =
    useCallback(
      async (
        silent = false
      ) => {
        if (!userId) {
          setCampfires([]);
          setError("");

          return;
        }

        if (!silent) {
          setLoading(true);
        }

        try {
          /*
           * Minhas Campfires.
           */
          const {
            data:
              campfireData,

            error:
              campfireError,
          } =
            await supabase.rpc(
              "get_my_campfires"
            );

          if (campfireError) {
            throw campfireError;
          }

          /*
           * Convites pendentes.
           *
           * Precisamos do ID do convite
           * para aceitar ou recusar.
           */
          const {
            data:
              inviteData,

            error:
              inviteError,
          } =
            await supabase
              .from(
                "campfire_invites"
              )
              .select(
                `
                  id,
                  campfire_id
                `
              )
              .eq(
                "invitee_id",
                userId
              )
              .eq(
                "status",
                "pending"
              );

          if (inviteError) {
            throw inviteError;
          }

          const inviteMap =
            new Map<
              string,
              string
            >();

          for (
            const invite
            of (
              inviteData ??
              []
            ) as RawInvite[]
          ) {
            inviteMap.set(
              invite.campfire_id,
              invite.id
            );
          }

          const rows =
            (
              campfireData ??
              []
            ) as RawCampfire[];

          const visualMap = new Map<
            string,
            RawCampfireVisual
          >();

          try {
            const {
              data: visualData,
              error: visualError,
            } = await supabase.rpc(
              "get_my_campfire_visuals"
            );

            if (visualError) {
              throw visualError;
            }

            for (
              const visual of (
                visualData ?? []
              ) as RawCampfireVisual[]
            ) {
              visualMap.set(
                visual.campfire_id,
                visual
              );
            }
          } catch (visualLoadError) {
            // Compatibilidade segura enquanto a migration R2 ainda não foi aplicada.
            console.warn(
              "Campfire R2: metadados de capa ainda não disponíveis.",
              visualLoadError
            );
          }

          /*
           * O sidebar mostra quem está dentro da Campfire em vez
           * de um contador abstrato. Pela regra do produto, um
           * usuário participa ativamente de uma Campfire por vez,
           * então carregamos roster apenas das salas em estado ativo.
           */
          const activeRosterEntries =
            await Promise.all(
              rows
                .filter((row) => row.my_state === "active")
                .map(async (row) => {
                  const { data, error: memberError } =
                    await supabase.rpc(
                      "get_campfire_members",
                      { p_campfire_id: row.id }
                    );

                  if (memberError) {
                    console.warn(
                      "Não foi possível carregar o roster da Campfire:",
                      row.id,
                      memberError
                    );

                    return [row.id, [] as CampfireRosterMember[]] as const;
                  }

                  const members =
                    (Array.isArray(data) ? data : [])
                      .map((member) => member as RawCampfireMember)
                      .map((member): CampfireRosterMember => ({
                        id: member.id,
                        username: member.username,
                        isOwner: member.is_owner === true,
                        isLeader: member.is_leader === true,
                      }))
                      .sort((a, b) => {
                        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
                        if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
                        return (a.username ?? "").localeCompare(
                          b.username ?? "",
                          "pt-BR"
                        );
                      });

                  return [row.id, members] as const;
                })
            );

          const rosterMap =
            new Map<string, CampfireRosterMember[]>(
              activeRosterEntries
            );

          const next =
            rows.map(
              (
                row
              ): CampfireItem => ({
                id:
                  row.id,

                name:
                  row.name,

                ownerId:
                  row.owner_id,

                privacy:
                  row.privacy,

                persistent:
                  row.persistent,

                lifecycle:
                  row.persistent
                    ? "permanent"
                    : "temporary",

                coverKind:
                  visualMap.get(row.id)?.cover_kind ??
                  "preset",

                coverRef:
                  visualMap.get(row.id)?.cover_ref ??
                  "cinema-night",

                inviteCode:
                  row.invite_code,

                createdAt:
                  row.created_at,

                emptySince:
                  row.empty_since,

                expiresAt:
                  row.expires_at,

                activePeople:
                  Number(
                    row.active_people ??
                      0
                  ),

                members:
                  rosterMap.get(
                    row.id
                  ) ?? [],

                myState:
                  row.my_state,

                inviteId:
                  inviteMap.get(
                    row.id
                  ) ??
                  null,
              })
            );

          setCampfires(
            next
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Erro carregando Campfires:",
            loadError
          );

          setError(
            mapCampfireError(
              loadError
            )
          );
        } finally {
          if (!silent) {
            setLoading(false);
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
   * REALTIME
   * =========================================================
   */

  useEffect(() => {
    if (!userId) {
      setRealtimeConnected(
        false
      );

      return;
    }

    const channel =
      supabase
        .channel(
          `campfire-rooms-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )

        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "campfires",
          },
          () => {
            void refresh(
              true
            );
          }
        )

        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "campfire_members",
          },
          () => {
            void refresh(
              true
            );
          }
        )

        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "campfire_invites",
          },
          () => {
            void refresh(
              true
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
                "🔥 Campfire Rooms Realtime conectado."
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
              setRealtimeConnected(
                false
              );
            }
          }
        );

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
   * RELÓGIO DE EXPIRAÇÃO
   * =========================================================
   *
   * Se uma sala estiver vazia,
   * get_my_campfires() deixa de
   * retorná-la após 5 minutos.
   *
   * Este refresh faz ela desaparecer
   * da interface mesmo sem nenhum
   * novo evento do banco.
   * =========================================================
   */

  useEffect(() => {
    if (!userId) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void refresh(
            true
          );
        },
        15000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    userId,
    refresh,
  ]);

  /*
   * =========================================================
   * CRIAR
   * =========================================================
   */

  async function createCampfire(
    input: CreateCampfireInput
  ): Promise<CampfireActionResult> {
    const cleanName =
      input.name.trim();

    if (
      cleanName.length < 1 ||
      cleanName.length > 40
    ) {
      return {
        ok: false,
        message:
          "Escolha um nome entre 1 e 40 caracteres.",
      };
    }

    if (
      !["private", "friends", "link"].includes(
        input.privacy
      )
    ) {
      return {
        ok: false,
        message: "Privacidade inválida.",
      };
    }

    if (
      !["preset", "storage", "web"].includes(
        input.coverKind
      ) ||
      !input.coverRef.trim()
    ) {
      return {
        ok: false,
        message: "Escolha uma imagem de capa válida.",
      };
    }

    try {
      const {
        data,
        error: rpcError,
      } =
        await supabase.rpc(
          "create_campfire_r2",
          {
            p_name: cleanName,
            p_privacy: input.privacy,
            p_invitee_ids: input.inviteeIds,
            p_persistent: input.lifecycle === "permanent",
            p_cover_kind: input.coverKind,
            p_cover_ref: input.coverRef.trim(),
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (
        typeof data !== "string"
      ) {
        throw new Error(
          "O banco não retornou o ID da Campfire."
        );
      }

      await refresh(true);

      return {
        ok: true,
        message: "Campfire acesa!",
        campfireId: data,
      };
    } catch (createError) {
      console.error(
        "Erro criando Campfire:",
        createError
      );

      const mapped = mapCampfireError(
        createError
      );

      if (/create_campfire_r2/i.test(mapped)) {
        return {
          ok: false,
          message:
            "A atualização de banco Campfire R2 ainda não foi aplicada. Execute a migração R2 do Supabase.",
        };
      }

      return {
        ok: false,
        message: mapped,
      };
    }
  }

  /*
   * =========================================================
   * SAIR
   * =========================================================
   */

  async function leaveCampfire(
    campfireId: string
  ): Promise<CampfireActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "leave_campfire",
          {
            p_campfire_id:
              campfireId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        throw new Error(
          "Não foi possível sair da Campfire."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,
        message:
          "Você saiu da Campfire.",
      };
    } catch (
      leaveError
    ) {
      console.error(
        "Erro saindo da Campfire:",
        leaveError
      );

      return {
        ok: false,
        message:
          mapCampfireError(
            leaveError
          ),
      };
    }
  }

  /*
   * =========================================================
   * REENTRAR
   * =========================================================
   */

  async function rejoinCampfire(
    campfireId: string
  ): Promise<CampfireActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "rejoin_campfire",
          {
            p_campfire_id:
              campfireId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        throw new Error(
          "Não foi possível retornar à Campfire."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,
        message:
          "Você voltou para a Campfire.",
      };
    } catch (
      rejoinError
    ) {
      console.error(
        "Erro reentrando na Campfire:",
        rejoinError
      );

      return {
        ok: false,
        message:
          mapCampfireError(
            rejoinError
          ),
      };
    }
  }

  /*
   * =========================================================
   * ACEITAR CONVITE
   * =========================================================
   */

  async function acceptInvite(
    inviteId: string
  ): Promise<CampfireActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "accept_campfire_invite",
          {
            p_invite_id:
              inviteId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (
        typeof data !==
        "string"
      ) {
        throw new Error(
          "Não foi possível aceitar o convite."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,
        message:
          "Você entrou na Campfire.",

        campfireId:
          data,
      };
    } catch (
      acceptError
    ) {
      console.error(
        "Erro aceitando convite:",
        acceptError
      );

      return {
        ok: false,
        message:
          mapCampfireError(
            acceptError
          ),
      };
    }
  }

  /*
   * =========================================================
   * RECUSAR CONVITE
   * =========================================================
   */

  async function declineInvite(
    inviteId: string
  ): Promise<CampfireActionResult> {
    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "decline_campfire_invite",
          {
            p_invite_id:
              inviteId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        throw new Error(
          "Não foi possível recusar o convite."
        );
      }

      await refresh(
        true
      );

      return {
        ok: true,
        message:
          "Convite recusado.",
      };
    } catch (
      declineError
    ) {
      console.error(
        "Erro recusando convite:",
        declineError
      );

      return {
        ok: false,
        message:
          mapCampfireError(
            declineError
          ),
      };
    }
  }

  return {
    campfires,

    loading,
    error,

    realtimeConnected,

    refresh,

    createCampfire,
    leaveCampfire,
    rejoinCampfire,

    acceptInvite,
    declineInvite,
  };
}