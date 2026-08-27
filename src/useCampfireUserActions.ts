import { useCallback, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  getUserLocalMediaPreference,
  setUserLocalMediaPreference,
  setUserVolume,
} from "./userLocalMediaPreferences";

export type FriendshipState = "none" | "friends" | "incoming" | "outgoing";

export type UserPrivateSettings = {
  note: string;
  alias: string;
  ignored: boolean;
  blocked: boolean;
  friendshipState: FriendshipState;
  friendshipId: string | null;
  effectsMuted: boolean;
  videoHidden: boolean;
};

export type InviteableCampfire = {
  id: string;
  name: string;
};

type Result = { ok: boolean; message: string };

type RawFriendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
};

type RawCampfire = {
  id: string;
  name: string;
  my_state: string;
};

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const text = String((error as { message?: unknown }).message ?? "");
    const upper = text.toUpperCase();
    if (upper.includes("NOT_FRIEND")) return "Só é possível convidar amigos para outra Campfire.";
    if (upper.includes("ALREADY_MEMBER")) return "Essa pessoa já participa dessa Campfire.";
    if (upper.includes("USER_BANNED")) return "Essa pessoa está banida dessa Campfire.";
    if (upper.includes("USER_BLOCKED")) return "A ação não pode ser concluída porque existe um bloqueio entre as contas.";
    return text || "Falha.";
  }
  return "Não foi possível concluir a ação.";
}

function mapFriendship(
  row: RawFriendship | null,
  currentUserId: string,
): Pick<UserPrivateSettings, "friendshipState" | "friendshipId"> {
  if (!row) return { friendshipState: "none", friendshipId: null };
  if (row.status === "accepted") return { friendshipState: "friends", friendshipId: row.id };
  return {
    friendshipState: row.requester_id === currentUserId ? "outgoing" : "incoming",
    friendshipId: row.id,
  };
}

export function useCampfireUserActions(currentUserId: string) {
  const [cache, setCache] = useState<Record<string, UserPrivateSettings>>({});

  const load = useCallback(async (targetUserId: string) => {
    const [settingsResult, blockResult, friendshipResult] = await Promise.all([
      supabase.from("user_private_relationship_settings")
        .select("note,alias,ignored")
        .eq("owner_user_id", currentUserId)
        .eq("target_user_id", targetUserId)
        .maybeSingle(),
      supabase.from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", targetUserId)
        .maybeSingle(),
      supabase.from("friendships")
        .select("id,requester_id,addressee_id,status")
        .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId})`)
        .maybeSingle(),
    ]);
    const friendship = mapFriendship(
      (friendshipResult.data as RawFriendship | null) ?? null,
      currentUserId,
    );
    const local = getUserLocalMediaPreference(targetUserId);
    const next: UserPrivateSettings = {
      note: typeof settingsResult.data?.note === "string" ? settingsResult.data.note : "",
      alias: typeof settingsResult.data?.alias === "string" ? settingsResult.data.alias : "",
      ignored: settingsResult.data?.ignored === true,
      blocked: Boolean(blockResult.data),
      friendshipState: friendship.friendshipState,
      friendshipId: friendship.friendshipId,
      effectsMuted: local.effectsMuted,
      videoHidden: local.videoHidden,
    };
    setCache((current) => ({ ...current, [targetUserId]: next }));
    return next;
  }, [currentUserId]);

  const updatePrivate = useCallback(async (
    targetUserId: string,
    patch: Partial<Pick<UserPrivateSettings, "note" | "alias" | "ignored">>
  ): Promise<Result> => {
    const { error } = await supabase.rpc("upsert_user_private_relationship_setting", {
      p_target_user_id: targetUserId,
      p_note: patch.note ?? null,
      p_alias: patch.alias ?? null,
      p_ignored: patch.ignored ?? null,
    });
    if (error) return { ok: false, message: errorText(error) };
    await load(targetUserId);
    return { ok: true, message: "Preferência salva." };
  }, [load]);

  const setBlocked = useCallback(async (targetUserId: string, blocked: boolean): Promise<Result> => {
    const { error } = await supabase.rpc("set_user_block", {
      p_target_user_id: targetUserId,
      p_blocked: blocked,
    });
    if (error) return { ok: false, message: errorText(error) };
    setUserLocalMediaPreference(targetUserId, {
      effectsMuted: blocked,
      videoHidden: blocked,
    });
    setUserVolume(targetUserId, blocked ? 0 : 100);
    await load(targetUserId);
    return { ok: true, message: blocked ? "Usuário bloqueado e mídia local silenciada." : "Bloqueio removido." };
  }, [load]);

  const toggleFriendship = useCallback(async (
    targetUserId: string,
    targetUsername: string | null,
  ): Promise<Result> => {
    const settings = cache[targetUserId] ?? await load(targetUserId);
    try {
      if (settings.friendshipState === "friends" && settings.friendshipId) {
        const { data, error } = await supabase.rpc("remove_friend", { p_friendship_id: settings.friendshipId });
        if (error) throw error;
        if (data === false) throw new Error("A amizade não pôde ser removida.");
        await load(targetUserId);
        return { ok: true, message: "Amizade desfeita." };
      }
      if (settings.friendshipState === "outgoing" && settings.friendshipId) {
        const { data, error } = await supabase.rpc("cancel_friend_request", { p_request_id: settings.friendshipId });
        if (error) throw error;
        if (data === false) throw new Error("O pedido não pôde ser cancelado.");
        await load(targetUserId);
        return { ok: true, message: "Pedido de amizade cancelado." };
      }
      if (settings.friendshipState === "incoming" && settings.friendshipId) {
        const { error } = await supabase.rpc("respond_friend_request", { p_request_id: settings.friendshipId, p_accept: true });
        if (error) throw error;
        await load(targetUserId);
        return { ok: true, message: "Pedido aceito. Vocês agora são amigos." };
      }
      const username = String(targetUsername ?? "").trim().replace(/^@+/, "").toLowerCase();
      const { error } = await supabase.rpc("send_campfire_friend_request", {
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      await load(targetUserId);
      return {
        ok: true,
        message: username ? `Pedido enviado para @${username}.` : "Pedido de amizade enviado.",
      };
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
  }, [cache, load]);

  const loadInviteableCampfires = useCallback(async (currentCampfireId: string): Promise<InviteableCampfire[]> => {
    const { data, error } = await supabase.rpc("get_my_campfires");
    if (error) return [];
    return ((data ?? []) as RawCampfire[])
      .filter((row) => row.id !== currentCampfireId && row.my_state === "active")
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, []);

  const inviteToCampfire = useCallback(async (campfireId: string, targetUserId: string): Promise<Result> => {
    try {
      const { error } = await supabase.rpc("invite_user_to_campfire", {
        p_campfire_id: campfireId,
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return { ok: true, message: "Convite enviado." };
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
  }, []);

  const setEffectsMuted = useCallback(async (targetUserId: string, muted: boolean): Promise<Result> => {
    setUserLocalMediaPreference(targetUserId, { effectsMuted: muted });
    await load(targetUserId);
    return { ok: true, message: muted ? "Efeitos sonoros desse usuário silenciados." : "Efeitos sonoros desse usuário reativados." };
  }, [load]);

  const setVideoHidden = useCallback(async (targetUserId: string, hidden: boolean): Promise<Result> => {
    setUserLocalMediaPreference(targetUserId, { videoHidden: hidden });
    await load(targetUserId);
    return { ok: true, message: hidden ? "Vídeo desse usuário ocultado para você." : "Vídeo desse usuário reativado para você." };
  }, [load]);

  const copyUserId = useCallback(async (targetUserId: string): Promise<Result> => {
    try {
      const nativeClipboard =
        window.campfireDesktop?.clipboard?.writeText;

      if (nativeClipboard) {
        await nativeClipboard(targetUserId);
        return { ok: true, message: "ID do usuário copiado." };
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUserId);
        return { ok: true, message: "ID do usuário copiado." };
      }

      const field = document.createElement("textarea");
      field.value = targetUserId;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();

      if (!copied) {
        throw new Error("A área de transferência não aceitou o texto.");
      }

      return { ok: true, message: "ID do usuário copiado." };
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
  }, []);

  return {
    cache,
    load,
    updatePrivate,
    setBlocked,
    toggleFriendship,
    loadInviteableCampfires,
    inviteToCampfire,
    setEffectsMuted,
    setVideoHidden,
    copyUserId,
  };
}
