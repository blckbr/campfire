import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";


export type CampfireMember = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  role: string;
  joined_at: string;
  is_owner: boolean;
  is_leader: boolean;
};


export type LeadershipActionResult = {
  ok: boolean;
  message: string;
};


function getLeadershipErrorMessage(error: unknown): string {
  let message = "";

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    message = String(
      (error as { message?: unknown }).message ?? ""
    );
  }

  const upper = message.toUpperCase();

  if (upper.includes("NOT_CAMPFIRE_LEADER")) {
    return "Somente o líder atual pode transferir a liderança.";
  }

  if (upper.includes("NEW_LEADER_NOT_ACTIVE_MEMBER")) {
    return "Essa pessoa não está mais dentro da Campfire.";
  }

  if (upper.includes("CAMPFIRE_NOT_FOUND")) {
    return "A Campfire não foi encontrada.";
  }

  if (upper.includes("NOT_AUTHENTICATED")) {
    return "Sua sessão expirou. Entre novamente no Campfire.";
  }

  if (upper.includes("INVALID_NEW_LEADER")) {
    return "Não foi possível selecionar o novo líder.";
  }

  if (upper.includes("NOT_ACTIVE_CAMPFIRE_MEMBER")) {
    return "Você não está mais dentro desta Campfire.";
  }

  if (upper.includes("NOT_CAMPFIRE_OWNER")) {
    return "Somente o owner atual pode executar esta ação.";
  }

  if (upper.includes("NEW_OWNER_NOT_ACTIVE_MEMBER")) {
    return "O novo owner precisa estar dentro da Campfire.";
  }

  if (upper.includes("INVALID_NEW_OWNER")) {
    return "Selecione outro membro para receber a propriedade.";
  }

  return message || "Não foi possível concluir a operação.";
}


export function useCampfireMembers(
  campfireId: string,
  currentUserId: string,
  active = true
) {
  const [members, setMembers] = useState<CampfireMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState("");


  const refresh = useCallback(
    async (silent = false) => {
      if (!active) {
        setMembers([]);
        setError("");
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const { data, error: rpcError } = await supabase.rpc(
          "get_campfire_members",
          {
            p_campfire_id: campfireId,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const rows = Array.isArray(data)
          ? (data as CampfireMember[])
          : [];

        setMembers(rows);
        setError("");
      } catch (loadError) {
        console.error(
          "Erro carregando participantes da Campfire:",
          loadError
        );

        setError(
          getLeadershipErrorMessage(loadError)
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [active, campfireId]
  );


  useEffect(() => {
    if (!active) {
      setMembers([]);
      setError("");
      setLoading(false);
      return;
    }

    void refresh();

    const channel = supabase
      .channel(`campfire-members-ui:${campfireId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campfire_members",
          filter: `campfire_id=eq.${campfireId}`,
        },
        () => {
          void refresh(true);
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campfires",
          filter: `id=eq.${campfireId}`,
        },
        () => {
          /*
           * leader_id mudou.
           */
          void refresh(true);
        }
      )

      .subscribe();


    /*
     * Fallback para o Alpha.
     *
     * Mesmo que alguma publicação
     * Realtime esteja atrasada,
     * a lista se corrige.
     */
    const fallbackTimer = window.setInterval(
      () => {
        void refresh(true);
      },
      15000
    );


    return () => {
      window.clearInterval(fallbackTimer);

      void supabase.removeChannel(channel);
    };
  }, [active, campfireId, refresh]);


  const leader = useMemo(
    () =>
      members.find(
        (member) => member.is_leader
      ) ?? null,
    [members]
  );


  const owner = useMemo(
    () =>
      members.find(
        (member) => member.is_owner
      ) ?? null,
    [members]
  );


  const currentMember = useMemo(
    () =>
      members.find(
        (member) =>
          member.id === currentUserId
      ) ?? null,
    [members, currentUserId]
  );


  const isCurrentUserLeader =
    currentMember?.is_leader === true;


  const isCurrentUserOwner =
    currentMember?.is_owner === true;


  async function transferLeadership(
    newLeaderId: string
  ): Promise<LeadershipActionResult> {
    if (transferring) {
      return {
        ok: false,
        message: "Aguarde a transferência atual terminar.",
      };
    }

    if (!isCurrentUserLeader) {
      return {
        ok: false,
        message: "Somente o líder atual pode transferir a liderança.",
      };
    }

    if (newLeaderId === currentUserId) {
      return {
        ok: false,
        message: "Você já é o líder desta Campfire.",
      };
    }

    const target = members.find(
      (member) =>
        member.id === newLeaderId
    );

    if (!target) {
      return {
        ok: false,
        message: "Essa pessoa não está mais na Campfire.",
      };
    }

    setTransferring(true);
    setError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "transfer_campfire_leadership",
        {
          p_campfire_id: campfireId,
          p_new_leader_id: newLeaderId,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      /*
       * Atualiza imediatamente.
       * O Realtime também atualizará
       * os outros computadores.
       */
      await refresh(true);

      return {
        ok: true,
        message: `${target.username ? `@${target.username}` : "O membro"} agora é o líder da Campfire.`,
      };
    } catch (transferError) {
      console.error(
        "Erro transferindo liderança:",
        transferError
      );

      const message =
        getLeadershipErrorMessage(
          transferError
        );

      setError(message);

      return {
        ok: false,
        message,
      };
    } finally {
      setTransferring(false);
    }
  }


  async function transferOwnership(
    newOwnerId: string
  ): Promise<LeadershipActionResult> {
    if (transferring) {
      return { ok: false, message: "Aguarde a transferência atual terminar." };
    }

    if (!isCurrentUserOwner) {
      return { ok: false, message: "Somente o owner atual pode transferir a propriedade." };
    }

    if (newOwnerId === currentUserId) {
      return { ok: false, message: "Você já é o owner desta Campfire." };
    }

    const target = members.find((member) => member.id === newOwnerId);
    if (!target) {
      return { ok: false, message: "Essa pessoa não está mais na Campfire." };
    }

    setTransferring(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(
        "transfer_campfire_ownership",
        { p_campfire_id: campfireId, p_new_owner_id: newOwnerId }
      );
      if (rpcError) throw rpcError;
      await refresh(true);
      return {
        ok: true,
        message: `${target.username ? `@${target.username}` : "O membro"} agora é o owner da Campfire.`,
      };
    } catch (transferError) {
      const message = getLeadershipErrorMessage(transferError);
      setError(message);
      return { ok: false, message };
    } finally {
      setTransferring(false);
    }
  }


  return {
    members,
    leader,
    owner,
    currentMember,

    isCurrentUserLeader,
    isCurrentUserOwner,

    loading,
    transferring,
    error,

    refresh,
    transferLeadership,
    transferOwnership,
  };
}