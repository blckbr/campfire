import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { AccessToken, TrackSource } from "npm:livekit-server-sdk@2.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type Purpose = "voice" | "watch" | "screen" | "direct-call";
type Body = {
  campfireId?: string;
  purpose?: Purpose;
  voiceChannelId?: string;
  callId?: string;
  connectionId?: string;
  publishing?: boolean;
};

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders });
}

function validUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function roomName(body: Required<Pick<Body, "campfireId" | "purpose">> & Body, voiceChannelId: string | null) {
  if (body.purpose === "voice") return `cf:${body.campfireId}:voice:${voiceChannelId ?? "general"}`;
  if (body.purpose === "watch") return `cf:${body.campfireId}:watch`;
  if (body.purpose === "screen") return `cf:${body.campfireId}:screen`;
  if (!body.callId) throw new Error("CALL_ID_REQUIRED");
  return `call:${body.callId}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
  const livekitKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
  if (!livekitUrl || !livekitKey || !livekitSecret) return json(503, { error: "MEDIA_NOT_CONFIGURED" });

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "NOT_AUTHENTICATED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) return json(401, { error: "NOT_AUTHENTICATED" });
  const principalId = userId;

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return json(400, { error: "INVALID_JSON" }); }

  const purpose = body.purpose;
  const campfireId = body.campfireId;
  const connectionId = body.connectionId;
  if (!campfireId || !purpose || !["voice", "watch", "screen", "direct-call"].includes(purpose)) {
    return json(400, { error: "INVALID_MEDIA_REQUEST" });
  }
  if (!validUuid(connectionId)) return json(400, { error: "INVALID_CONNECTION_ID" });

  if (purpose === "direct-call") {
    if (userData.user?.is_anonymous) return json(403, { error: "GUEST_DIRECT_CALL_NOT_ALLOWED" });
    const callId = body.callId;
    if (!callId) return json(400, { error: "CALL_ID_REQUIRED" });
    const { data: call, error: callError } = await supabase
      .from("direct_call_sessions")
      .select("id,campfire_id,caller_id,callee_id,status")
      .eq("id", callId)
      .maybeSingle();
    if (callError || !call) return json(403, { error: "CALL_NOT_FOUND" });
    if (String(call.campfire_id) !== campfireId) return json(403, { error: "CALL_CAMPFIRE_MISMATCH" });
    if (userId !== String(call.caller_id ?? "") && userId !== String(call.callee_id ?? "")) {
      return json(403, { error: "NOT_CALL_PARTICIPANT" });
    }
    if (String(call.status) !== "active") return json(409, { error: "CALL_NOT_ACTIVE" });
  }

  const { data: memberRows, error: memberError } = await supabase.rpc("get_campfire_members", {
    p_campfire_id: campfireId,
  });
  if (memberError) return json(503, { error: "MEMBERSHIP_CHECK_FAILED" });
  const isPermanentMember = Array.isArray(memberRows) && memberRows.some((member) => String(member?.id ?? "") === userId);

  const { data: canParticipate, error: participateError } = await supabase.rpc("can_participate_in_campfire", {
    p_campfire_id: campfireId,
    p_user_id: userId,
  });
  if (participateError || canParticipate !== true) return json(403, { error: "NOT_MEMBER_OR_GUEST" });
  if (purpose === "direct-call" && !isPermanentMember) return json(403, { error: "DIRECT_CALL_REQUIRES_MEMBERSHIP" });

  const { data: moderation } = await supabase
    .from("campfire_member_media_state")
    .select("room_voice_muted,room_deafened,room_video_disabled,room_screen_disabled,voice_channel_id")
    .eq("campfire_id", campfireId)
    .eq("user_id", userId)
    .maybeSingle();

  let voiceChannelId = body.voiceChannelId ?? moderation?.voice_channel_id ?? null;
  if (purpose === "voice" && !voiceChannelId) {
    const { data: defaultChannel } = await supabase
      .from("campfire_voice_channels")
      .select("id")
      .eq("campfire_id", campfireId)
      .eq("is_default", true)
      .maybeSingle();
    voiceChannelId = defaultChannel?.id ?? null;
  }

  const wantsPublishing =
    purpose === "voice" || purpose === "direct-call" || body.publishing === true;

  let hasPublishingLease = purpose === "direct-call";
  if (purpose !== "direct-call" && wantsPublishing) {
    const { data: lease, error: leaseError } = await supabase.rpc("acquire_campfire_media_lease", {
      p_campfire_id: campfireId,
      p_purpose: purpose,
      p_connection_id: connectionId,
    });
    if (leaseError) return json(503, { error: "MEDIA_LEASE_CHECK_FAILED" });
    hasPublishingLease = lease === true;
  }

  const canPublishMicrophone =
    purpose === "direct-call" || (purpose === "voice" && wantsPublishing && hasPublishingLease && moderation?.room_voice_muted !== true);
  const canPublishCamera =
    purpose === "direct-call" || (purpose === "voice" && wantsPublishing && hasPublishingLease && moderation?.room_video_disabled !== true);
  const canPublishScreen =
    wantsPublishing && (purpose === "watch" || purpose === "screen") && hasPublishingLease && moderation?.room_screen_disabled !== true;

  const canPublishSources: TrackSource[] = [];
  if (canPublishMicrophone) canPublishSources.push(TrackSource.MICROPHONE);
  if (canPublishCamera) canPublishSources.push(TrackSource.CAMERA);
  if (canPublishScreen) canPublishSources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);

  try {
    const targetRoom = roomName({ campfireId, purpose, ...body }, voiceChannelId);
    const accessToken = new AccessToken(livekitKey, livekitSecret, {
      identity: `${userId}:${connectionId}`,
      ttl: "10m",
      metadata: JSON.stringify({ principalId, connectionId, campfireId, purpose, voiceChannelId }),
    });
    accessToken.addGrant({
      roomJoin: true,
      room: targetRoom,
      canSubscribe: purpose === "direct-call" ? true : moderation?.room_deafened !== true,
      canPublish: canPublishSources.length > 0,
      canPublishData: true,
      canPublishSources,
    });

    return json(200, {
      url: livekitUrl,
      token: await accessToken.toJwt(),
      roomName: targetRoom,
      identity: `${userId}:${connectionId}`,
      principalId,
      connectionId,
      publishingLease: hasPublishingLease,
      permissions: {
        canPublishMicrophone,
        canPublishCamera,
        canPublishScreen,
        canSubscribe: purpose === "direct-call" ? true : moderation?.room_deafened !== true,
      },
    });
  } catch (error) {
    console.error("campfire-media-token", error);
    return json(500, { error: "TOKEN_CREATE_FAILED" });
  }
});
