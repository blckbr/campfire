import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export type CampfireVoiceChannel = {
  id: string;
  campfire_id: string;
  name: string;
  position: number;
  is_default: boolean;
};

export type CampfireMemberMediaState = {
  campfire_id: string;
  user_id: string;
  room_voice_muted: boolean;
  room_deafened: boolean;
  room_video_disabled: boolean;
  room_screen_disabled: boolean;
  voice_channel_id: string | null;
};

export type CampfireModerationLog = {
  id: string;
  campfire_id: string;
  actor_user_id: string;
  target_user_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type Result = { ok: boolean; message: string };
type AdminAction = "sync-moderation" | "move" | "disconnect";

function msg(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const raw = String((error as { message?: unknown }).message ?? "Falha de moderação.");
    const upper = raw.toUpperCase();
    if (upper.includes("CANNOT_DELETE_DEFAULT_VOICE_CHANNEL")) return "O canal Geral/padrão não pode ser excluído.";
    if (upper.includes("INVALID_VOICE_CHANNEL_NAME")) return "O nome do canal deve ter entre 1 e 40 caracteres.";
    if (upper.includes("NOT_CAMPFIRE_OWNER")) return "Somente o owner pode executar esta ação.";
    return raw;
  }
  return "Não foi possível concluir a ação de moderação.";
}

export function useCampfireModeration(campfireId: string, isOwner: boolean) {
  const [channels, setChannels] = useState<CampfireVoiceChannel[]>([]);
  const [states, setStates] = useState<Record<string, CampfireMemberMediaState>>({});
  const [logs, setLogs] = useState<CampfireModerationLog[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!campfireId) return;
    const requests = [
      supabase.from("campfire_voice_channels")
        .select("id,campfire_id,name,position,is_default")
        .eq("campfire_id", campfireId)
        .order("position"),
      supabase.from("campfire_member_media_state")
        .select("campfire_id,user_id,room_voice_muted,room_deafened,room_video_disabled,room_screen_disabled,voice_channel_id")
        .eq("campfire_id", campfireId),
    ] as const;
    const [channelResult, stateResult] = await Promise.all(requests);

    if (channelResult.error) setError(msg(channelResult.error));
    else setChannels((channelResult.data ?? []) as CampfireVoiceChannel[]);

    if (stateResult.error) {
      setError(msg(stateResult.error));
    } else {
      const next: Record<string, CampfireMemberMediaState> = {};
      for (const row of (stateResult.data ?? []) as CampfireMemberMediaState[]) next[row.user_id] = row;
      setStates(next);
    }

    if (isOwner) {
      const logResult = await supabase.from("campfire_moderation_log")
        .select("id,campfire_id,actor_user_id,target_user_id,action,metadata,created_at")
        .eq("campfire_id", campfireId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (logResult.error) setError(msg(logResult.error));
      else setLogs((logResult.data ?? []) as CampfireModerationLog[]);
    } else {
      setLogs([]);
    }
  }, [campfireId, isOwner]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`campfire-media-state-ui:${campfireId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campfire_member_media_state", filter: `campfire_id=eq.${campfireId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "campfire_voice_channels", filter: `campfire_id=eq.${campfireId}` }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campfire_moderation_log", filter: `campfire_id=eq.${campfireId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [campfireId, refresh]);

  const requireOwner = (): Result | null => isOwner
    ? null
    : { ok: false, message: "Somente o owner pode executar esta ação." };

  const invokeLiveKitAdmin = useCallback(async (
    action: AdminAction,
    targetUserId: string,
    voiceChannelId?: string,
  ): Promise<Result> => {
    const { error: functionError } = await supabase.functions.invoke("campfire-media-admin", {
      body: {
        campfireId,
        targetUserId,
        action,
        ...(voiceChannelId ? { voiceChannelId } : {}),
      },
    });
    if (functionError) {
      return {
        ok: false,
        message: `A regra foi salva, mas a sessão LiveKit ativa não pôde ser atualizada: ${msg(functionError)}`,
      };
    }
    return { ok: true, message: "Sessão de mídia atualizada em tempo real." };
  }, [campfireId]);

  const createChannel = useCallback(async (name: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("create_campfire_voice_channel", {
      p_campfire_id: campfireId,
      p_name: name,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    return { ok: true, message: "Canal de voz criado." };
  }, [campfireId, isOwner, refresh]);

  const renameChannel = useCallback(async (voiceChannelId: string, name: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("rename_campfire_voice_channel", {
      p_campfire_id: campfireId,
      p_voice_channel_id: voiceChannelId,
      p_name: name,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    return { ok: true, message: "Canal de voz renomeado." };
  }, [campfireId, isOwner, refresh]);

  const deleteChannel = useCallback(async (voiceChannelId: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("delete_campfire_voice_channel", {
      p_campfire_id: campfireId,
      p_voice_channel_id: voiceChannelId,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    return { ok: true, message: "Canal removido. Participantes foram movidos para Geral." };
  }, [campfireId, isOwner, refresh]);

  const setFlags = useCallback(async (targetUserId: string, flags: Partial<Pick<CampfireMemberMediaState,
    "room_voice_muted" | "room_deafened" | "room_video_disabled" | "room_screen_disabled">>): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("set_campfire_member_moderation", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
      p_room_voice_muted: flags.room_voice_muted ?? null,
      p_room_deafened: flags.room_deafened ?? null,
      p_room_video_disabled: flags.room_video_disabled ?? null,
      p_room_screen_disabled: flags.room_screen_disabled ?? null,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    const live = await invokeLiveKitAdmin("sync-moderation", targetUserId);
    return live.ok
      ? { ok: true, message: "Permissão da sala atualizada em tempo real." }
      : live;
  }, [campfireId, isOwner, refresh, invokeLiveKitAdmin]);

  const moveTo = useCallback(async (targetUserId: string, voiceChannelId: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("move_campfire_voice_member", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
      p_voice_channel_id: voiceChannelId,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    const live = await invokeLiveKitAdmin("move", targetUserId, voiceChannelId);
    return live.ok ? { ok: true, message: "Usuário movido de canal." } : live;
  }, [campfireId, isOwner, refresh, invokeLiveKitAdmin]);

  const disconnect = useCallback(async (targetUserId: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("disconnect_campfire_voice_member", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    const live = await invokeLiveKitAdmin("disconnect", targetUserId);
    return live.ok ? { ok: true, message: "Usuário desconectado da voz." } : live;
  }, [campfireId, isOwner, invokeLiveKitAdmin]);

  const setRole = useCallback(async (
    targetUserId: string,
    role: "member" | "moderator" | "presenter",
  ): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("set_campfire_member_role", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
      p_role: role,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await refresh();
    return {
      ok: true,
      message: role === "moderator"
        ? "Cargo Moderador aplicado. Os poderes administrativos continuam exclusivos do owner."
        : role === "presenter"
          ? "Cargo Apresentador aplicado."
          : "Cargo Membro aplicado.",
    };
  }, [campfireId, isOwner, refresh]);

  const kick = useCallback(async (targetUserId: string): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("kick_campfire_member", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await invokeLiveKitAdmin("disconnect", targetUserId);
    await refresh();
    return { ok: true, message: "Usuário expulso da Campfire." };
  }, [campfireId, isOwner, invokeLiveKitAdmin, refresh]);

  const ban = useCallback(async (targetUserId: string, reason = ""): Promise<Result> => {
    const denied = requireOwner(); if (denied) return denied;
    const { error: rpcError } = await supabase.rpc("ban_campfire_member", {
      p_campfire_id: campfireId,
      p_target_user_id: targetUserId,
      p_reason: reason.trim() || null,
    });
    if (rpcError) return { ok: false, message: msg(rpcError) };
    await invokeLiveKitAdmin("disconnect", targetUserId);
    await refresh();
    return { ok: true, message: "Usuário banido da Campfire." };
  }, [campfireId, isOwner, invokeLiveKitAdmin, refresh]);

  return {
    channels, states, logs, error, refresh,
    createChannel, renameChannel, deleteChannel,
    setFlags, moveTo, disconnect, setRole, kick, ban,
  };
}
