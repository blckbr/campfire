import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  RoomServiceClient,
  TrackSource,
  trackSourceToString,
} from "npm:livekit-server-sdk@2.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type ModerationState = {
  room_voice_muted: boolean;
  room_deafened: boolean;
  room_video_disabled: boolean;
  room_screen_disabled: boolean;
  voice_channel_id: string | null;
};

type Body = {
  campfireId?: string;
  targetUserId?: string;
  action?: "sync-moderation" | "move" | "disconnect";
  voiceChannelId?: string;
};

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders });
}

function voiceRoom(campfireId: string, channelId: string | null) {
  return `cf:${campfireId}:voice:${channelId ?? "general"}`;
}

function purposeRooms(campfireId: string) {
  return [
    `cf:${campfireId}:watch`,
    `cf:${campfireId}:screen`,
  ];
}

async function findConnectedVoiceRoom(
  service: RoomServiceClient,
  campfireId: string,
  targetUserId: string,
  channelIds: string[],
) {
  for (const channelId of channelIds) {
    const room = voiceRoom(campfireId, channelId);
    try {
      await service.getParticipant(room, targetUserId);
      return room;
    } catch {
      // User is simply not in this voice room.
    }
  }
  return null;
}

function sourcesForVoice(state: ModerationState): TrackSource[] {
  const result: TrackSource[] = [];
  if (!state.room_voice_muted) result.push(TrackSource.MICROPHONE);
  if (!state.room_video_disabled) result.push(TrackSource.CAMERA);
  return result;
}

function sourcesForScreen(state: ModerationState): TrackSource[] {
  if (state.room_screen_disabled) return [];
  return [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO];
}

async function syncRoomPermissions(
  service: RoomServiceClient,
  room: string,
  targetUserId: string,
  state: ModerationState,
  allowedSources: TrackSource[],
) {
  let participant;
  try {
    participant = await service.getParticipant(room, targetUserId);
  } catch {
    return false;
  }

  const current = participant.permission;
  await service.updateParticipant(room, targetUserId, {
    permission: {
      ...(current ?? {}),
      canSubscribe: !state.room_deafened,
      canPublish: allowedSources.length > 0,
      canPublishSources: allowedSources,
    },
  });

  for (const track of participant.tracks ?? []) {
    const source = trackSourceToString(track.source);
    const shouldMute =
      (source === "microphone" && state.room_voice_muted) ||
      (source === "camera" && state.room_video_disabled) ||
      ((source === "screen_share" || source === "screen_share_audio") && state.room_screen_disabled);

    const shouldUnmute =
      (source === "microphone" && !state.room_voice_muted) ||
      (source === "camera" && !state.room_video_disabled) ||
      ((source === "screen_share" || source === "screen_share_audio") && !state.room_screen_disabled);

    if ((shouldMute || shouldUnmute) && track.muted !== shouldMute) {
      await service.mutePublishedTrack(room, targetUserId, track.sid, shouldMute);
    }
  }
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "NOT_AUTHENTICATED" });

  const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
  const livekitKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
  if (!livekitUrl || !livekitKey || !livekitSecret) return json(503, { error: "MEDIA_NOT_CONFIGURED" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData.user?.id;
  if (!actorId) return json(401, { error: "NOT_AUTHENTICATED" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const campfireId = body.campfireId ?? "";
  const targetUserId = body.targetUserId ?? "";
  const action = body.action;
  if (!campfireId || !targetUserId || !action) return json(400, { error: "INVALID_ADMIN_REQUEST" });
  if (targetUserId === actorId) return json(400, { error: "OWNER_CANNOT_MODERATE_SELF" });

  const { data: members, error: memberError } = await supabase.rpc("get_campfire_members", {
    p_campfire_id: campfireId,
  });
  if (memberError || !Array.isArray(members)) return json(403, { error: "MEMBERSHIP_CHECK_FAILED" });

  const actor = members.find((member) => String(member?.id ?? "") === actorId);
  const target = members.find((member) => String(member?.id ?? "") === targetUserId);
  if (!actor?.is_owner) return json(403, { error: "NOT_CAMPFIRE_OWNER" });
  if (!target) return json(404, { error: "TARGET_NOT_ACTIVE_MEMBER" });

  const { data: channelRows, error: channelError } = await supabase
    .from("campfire_voice_channels")
    .select("id,is_default")
    .eq("campfire_id", campfireId)
    .order("position");
  if (channelError) return json(500, { error: "VOICE_CHANNEL_QUERY_FAILED" });

  const channels = (channelRows ?? []) as Array<{ id: string; is_default: boolean }>;
  const channelIds = channels.map((channel) => channel.id);
  const defaultChannelId = channels.find((channel) => channel.is_default)?.id ?? null;

  const { data: stateRow } = await supabase
    .from("campfire_member_media_state")
    .select("room_voice_muted,room_deafened,room_video_disabled,room_screen_disabled,voice_channel_id")
    .eq("campfire_id", campfireId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  const state: ModerationState = {
    room_voice_muted: stateRow?.room_voice_muted === true,
    room_deafened: stateRow?.room_deafened === true,
    room_video_disabled: stateRow?.room_video_disabled === true,
    room_screen_disabled: stateRow?.room_screen_disabled === true,
    voice_channel_id: stateRow?.voice_channel_id ?? defaultChannelId,
  };

  const livekitServerUrl = livekitUrl
    .replace(/^wss:/i, "https:")
    .replace(/^ws:/i, "http:");
  const service = new RoomServiceClient(livekitServerUrl, livekitKey, livekitSecret);

  try {
    if (action === "disconnect") {
      const sourceRoom = await findConnectedVoiceRoom(service, campfireId, targetUserId, channelIds);
      if (sourceRoom) await service.removeParticipant(sourceRoom, targetUserId);
      return json(200, { ok: true, connected: Boolean(sourceRoom) });
    }

    if (action === "move") {
      const destinationId = body.voiceChannelId ?? state.voice_channel_id;
      if (!destinationId || !channelIds.includes(destinationId)) return json(400, { error: "VOICE_CHANNEL_NOT_FOUND" });
      const sourceRoom = await findConnectedVoiceRoom(service, campfireId, targetUserId, channelIds);
      const destinationRoom = voiceRoom(campfireId, destinationId);
      if (sourceRoom && sourceRoom !== destinationRoom) {
        await service.moveParticipant(sourceRoom, targetUserId, destinationRoom);
      }
      return json(200, { ok: true, connected: Boolean(sourceRoom), destinationRoom });
    }

    const voiceSourceRoom = await findConnectedVoiceRoom(service, campfireId, targetUserId, channelIds);
    let updated = 0;
    if (voiceSourceRoom && await syncRoomPermissions(
      service,
      voiceSourceRoom,
      targetUserId,
      state,
      sourcesForVoice(state),
    )) updated += 1;

    for (const room of purposeRooms(campfireId)) {
      if (await syncRoomPermissions(service, room, targetUserId, state, sourcesForScreen(state))) updated += 1;
    }

    return json(200, { ok: true, updatedRooms: updated });
  } catch (error) {
    console.error("campfire-media-admin", error);
    return json(502, { error: "LIVEKIT_ADMIN_FAILED" });
  }
});
