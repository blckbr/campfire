import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalTrackPublication, type RemoteTrack } from "livekit-client";
import { supabase } from "./lib/supabase";
import { requestCampfireMediaToken } from "./media/livekitToken";
import { campfireConnectionId } from "./web/platform";

export type CampfireScreenSession = {
  id: string;
  campfireId: string;
  hostId: string;
  sessionType: "screen" | "watch";
  title: string | null;
  metadata: Record<string, unknown>;
  startedAt: string;
  hostUsername: string | null;
  hostDisplayName: string | null;
  hostAvatarUrl: string | null;
};
export type WebRTCViewerState = "idle" | "waiting" | "connecting" | "connected" | "disconnected" | "failed";
export type WebRTCActionResult = { ok: boolean; message: string; sessionId?: string };
type RawScreenSession = {
  id: string; campfire_id: string; host_id: string; session_type: "screen" | "watch";
  title: string | null; metadata: unknown; started_at: string;
  host_username: string | null; host_display_name: string | null; host_avatar_url: string | null;
};
function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function mapSession(row: RawScreenSession): CampfireScreenSession {
  return { id: row.id, campfireId: row.campfire_id, hostId: row.host_id, sessionType: row.session_type,
    title: row.title, metadata: normalizeMetadata(row.metadata), startedAt: row.started_at,
    hostUsername: row.host_username, hostDisplayName: row.host_display_name, hostAvatarUrl: row.host_avatar_url };
}
function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "Falha de transmissão.")
    : "Não foi possível concluir a transmissão.";
}

export function useCampfireLiveKitBroadcast(campfireId: string) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<CampfireScreenSession | null>(null);
  const [canShareScreen, setCanShareScreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signalingReady, setSignalingReady] = useState(false);
  const [viewerState, setViewerState] = useState<WebRTCViewerState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const publicationsRef = useRef<LocalTrackPublication[]>([]);
  const activeSessionRef = useRef<CampfireScreenSession | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const leaseHeartbeatRef = useRef<number | null>(null);
  const leasePurposeRef = useRef<"screen" | "watch" | null>(null);
  const mediaConnectionIdRef = useRef(campfireConnectionId());

  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  const refreshSession = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sessionResult, permissionResult] = await Promise.all([
        supabase.rpc("get_active_campfire_screen_session", { p_campfire_id: campfireId }),
        supabase.rpc("can_current_user_share_screen", { p_campfire_id: campfireId }),
      ]);
      if (sessionResult.error) throw sessionResult.error;
      if (permissionResult.error) throw permissionResult.error;
      const rows = (sessionResult.data ?? []) as RawScreenSession[];
      setActiveSession(rows.length ? mapSession(rows[0]) : null);
      setCanShareScreen(permissionResult.data === true);
      setError("");
    } catch (refreshError) { setError(errorMessage(refreshError)); }
    finally { if (!silent) setLoading(false); }
  }, [campfireId]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) { setCurrentUserId(data.session?.user.id ?? null); void refreshSession(); }
    });
    return () => { cancelled = true; };
  }, [refreshSession]);

  useEffect(() => {
    const realtimeMountId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`campfire-screen-db-${campfireId}-${realtimeMountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campfire_screen_sessions", filter: `campfire_id=eq.${campfireId}` }, () => void refreshSession(true))
      .subscribe((status) => setSignalingReady(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [campfireId, refreshSession]);

  const closeRoom = useCallback(() => {
    if (leaseHeartbeatRef.current !== null) {
      window.clearInterval(leaseHeartbeatRef.current);
      leaseHeartbeatRef.current = null;
    }
    const leasePurpose = leasePurposeRef.current;
    leasePurposeRef.current = null;
    if (leasePurpose) {
      void supabase.rpc("release_campfire_media_lease", {
        p_campfire_id: campfireId,
        p_purpose: leasePurpose,
        p_connection_id: mediaConnectionIdRef.current,
      });
    }
    const room = roomRef.current; roomRef.current = null;
    if (room) room.disconnect();
    publicationsRef.current = [];
    setRemoteStream(null); setViewerCount(0); setViewerState("idle");
  }, [campfireId]);

  const addRemoteTrack = useCallback((track: RemoteTrack) => {
    setRemoteStream((current) => {
      const stream = current ? new MediaStream(current.getTracks()) : new MediaStream();
      if (!stream.getTracks().some((item) => item.id === track.mediaStreamTrack.id)) stream.addTrack(track.mediaStreamTrack);
      return stream;
    });
    setViewerState("connected");
  }, []);

  const connectRoom = useCallback(async (purpose: "screen" | "watch", publishing: boolean) => {
    closeRoom();
    const credentials = await requestCampfireMediaToken({ campfireId, purpose, publishing });
    const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track) => addRemoteTrack(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      setRemoteStream((current) => current ? new MediaStream(current.getTracks().filter((item) => item.id !== track.mediaStreamTrack.id)) : null);
    });
    room.on(RoomEvent.ParticipantConnected, () => setViewerCount(room.remoteParticipants.size));
    room.on(RoomEvent.ParticipantDisconnected, () => setViewerCount(room.remoteParticipants.size));
    room.on(RoomEvent.Reconnecting, () => setViewerState("connecting"));
    room.on(RoomEvent.Reconnected, () => setViewerState("connected"));
    room.on(RoomEvent.Disconnected, () => setViewerState("disconnected"));
    await room.connect(credentials.url, credentials.token);
    if (publishing && credentials.publishingLease) {
      leasePurposeRef.current = purpose;
      leaseHeartbeatRef.current = window.setInterval(() => {
        void supabase.rpc("refresh_campfire_media_lease", {
          p_campfire_id: campfireId,
          p_purpose: purpose,
          p_connection_id: mediaConnectionIdRef.current,
        });
      }, 60_000);
    }
    setViewerCount(room.remoteParticipants.size);
    return room;
  }, [addRemoteTrack, campfireId, closeRoom]);

  async function startHosting(stream: MediaStream, title = "Compartilhamento de tela"): Promise<WebRTCActionResult> {
    if (!canShareScreen) return { ok: false, message: "Você não possui permissão para compartilhar nesta Campfire." };
    if (activeSessionRef.current) return { ok: false, message: "Já existe uma transmissão ativa." };
    const purpose: "screen" | "watch" = /^anime\b|watch/i.test(title) ? "watch" : "screen";
    try {
      const { data, error: rpcError } = await supabase.rpc("start_campfire_screen_session", {
        p_campfire_id: campfireId, p_session_type: purpose, p_title: title, p_metadata: { transport: "livekit" },
      });
      if (rpcError) throw rpcError;
      if (typeof data !== "string") throw new Error("O banco não retornou o ID da transmissão.");
      const room = await connectRoom(purpose, true);
      for (const track of stream.getTracks()) {
        const source = track.kind === "audio" ? Track.Source.ScreenShareAudio : Track.Source.ScreenShare;
        const publication = await room.localParticipant.publishTrack(track, { source, simulcast: track.kind === "video" } as never);
        publicationsRef.current.push(publication);
      }
      await refreshSession(true);
      return { ok: true, message: "Transmissão SFU iniciada.", sessionId: data };
    } catch (startError) { closeRoom(); return { ok: false, message: errorMessage(startError) }; }
  }

  async function stopHosting(): Promise<WebRTCActionResult> {
    const session = activeSessionRef.current; const userId = currentUserIdRef.current;
    if (!session || !userId || session.hostId !== userId) return { ok: false, message: "Você não é o apresentador desta transmissão." };
    try {
      const { error: rpcError } = await supabase.rpc("stop_campfire_screen_session", { p_session_id: session.id });
      if (rpcError) throw rpcError;
      closeRoom(); await refreshSession(true);
      return { ok: true, message: "Transmissão encerrada." };
    } catch (stopError) { return { ok: false, message: errorMessage(stopError) }; }
  }

  async function joinViewing(): Promise<WebRTCActionResult> {
    const session = activeSessionRef.current; const userId = currentUserIdRef.current;
    if (!session || !userId) return { ok: false, message: "Não existe transmissão ativa." };
    if (session.hostId === userId) return { ok: false, message: "Você é o apresentador." };
    try {
      setViewerState("connecting");
      await connectRoom(session.sessionType === "watch" ? "watch" : "screen", false);
      return { ok: true, message: "Conectado à transmissão SFU." };
    } catch (joinError) { setViewerState("failed"); return { ok: false, message: errorMessage(joinError) }; }
  }
  async function leaveViewing(): Promise<void> { closeRoom(); }

  useEffect(() => {
    if (!activeSession) closeRoom();
  }, [activeSession, closeRoom]);
  useEffect(() => () => closeRoom(), [closeRoom]);

  return { currentUserId, activeSession, canShareScreen, loading, error, signalingReady, viewerState, remoteStream, viewerCount,
    refreshSession, startHosting, stopHosting, joinViewing, leaveViewing };
}
