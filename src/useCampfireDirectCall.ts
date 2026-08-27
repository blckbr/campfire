import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioPresets,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteTrack,
} from "livekit-client";
import { supabase } from "./lib/supabase";
import {
  audioInputConstraint,
  loadCampfireMediaSettings,
  videoInputConstraint,
} from "./campfireMediaSettings";
import { requestCampfireMediaToken } from "./media/livekitToken";

export type DirectCallStatus = "ringing" | "active" | "declined" | "ended";

export type DirectCallSession = {
  id: string;
  campfireId: string;
  callerId: string;
  calleeId: string;
  status: DirectCallStatus;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

type RawDirectCall = {
  id: string;
  campfire_id: string;
  caller_id: string;
  callee_id: string;
  status: DirectCallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

type Result = { ok: boolean; message: string };

function mapCall(row: RawDirectCall): DirectCallSession {
  return {
    id: row.id,
    campfireId: row.campfire_id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    status: row.status,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
  };
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const text = String((error as { message?: unknown }).message ?? "");
    const upper = text.toUpperCase();
    if (upper.includes("USER_BLOCKED")) return "A chamada não pode ser iniciada porque existe um bloqueio entre as contas.";
    if (upper.includes("TARGET_NOT_ACTIVE_MEMBER")) return "A pessoa não está mais nesta Campfire.";
    if (upper.includes("CALL_NOT_AVAILABLE")) return "Esta chamada não está mais disponível.";
    return text || "Falha na chamada privada.";
  }
  return "Não foi possível concluir a chamada privada.";
}

export function useCampfireDirectCall(
  campfireId: string,
  currentUserId: string,
  active: boolean,
) {
  const [session, setSession] = useState<DirectCallSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");

  const sessionRef = useRef<DirectCallSession | null>(null);
  const roomRef = useRef<Room | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micPublicationRef = useRef<LocalTrackPublication | null>(null);
  const cameraPublicationRef = useRef<LocalTrackPublication | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const connectedCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const cleanupMedia = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    connectedCallIdRef.current = null;
    if (room) {
      try { room.removeAllListeners(); } catch { /* optional */ }
      try { await room.disconnect(); } catch { /* optional */ }
    }
    micPublicationRef.current = null;
    cameraPublicationRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    cameraStreamRef.current = null;
    remoteStreamRef.current.getTracks().forEach((track) => remoteStreamRef.current.removeTrack(track));
    remoteStreamRef.current = new MediaStream();
    setRemoteStream(null);
    setLocalCameraStream(null);
    setConnected(false);
    setConnecting(false);
    setMuted(false);
    setCameraEnabled(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!active || !campfireId || !currentUserId) {
      setSession(null);
      return;
    }
    const { data, error: loadError } = await supabase
      .from("direct_call_sessions")
      .select("id,campfire_id,caller_id,callee_id,status,created_at,answered_at,ended_at")
      .eq("campfire_id", campfireId)
      .or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`)
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (loadError) {
      setError(errorText(loadError));
      return;
    }
    const next = data ? mapCall(data as RawDirectCall) : null;
    setSession(next);
    sessionRef.current = next;
    if (!next && roomRef.current) await cleanupMedia();
  }, [active, campfireId, cleanupMedia, currentUserId]);

  const addRemoteTrack = useCallback((track: RemoteTrack) => {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;
    const stream = remoteStreamRef.current;
    if (!stream.getTracks().some((item) => item.id === mediaTrack.id)) stream.addTrack(mediaTrack);
    setRemoteStream(new MediaStream(stream.getTracks()));
  }, []);

  const removeRemoteTrack = useCallback((track: RemoteTrack) => {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;
    const stream = remoteStreamRef.current;
    for (const item of stream.getTracks()) {
      if (item.id === mediaTrack.id) stream.removeTrack(item);
    }
    setRemoteStream(stream.getTracks().length ? new MediaStream(stream.getTracks()) : null);
  }, []);

  const connectMedia = useCallback(async (call: DirectCallSession) => {
    if (call.status !== "active") return;
    if (connectedCallIdRef.current === call.id && roomRef.current) return;
    setConnecting(true);
    setError("");
    try {
      await cleanupMedia();
      setConnecting(true);
      const credentials = await requestCampfireMediaToken({
        campfireId,
        purpose: "direct-call",
        callId: call.id,
      });
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        stopLocalTrackOnUnpublish: true,
      });
      roomRef.current = room;
      connectedCallIdRef.current = call.id;
      room.on(RoomEvent.TrackSubscribed, (track) => addRemoteTrack(track));
      room.on(RoomEvent.TrackUnsubscribed, (track) => removeRemoteTrack(track));
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setConnecting(false);
      });
      await room.connect(credentials.url, credentials.token);

      if (credentials.permissions.canPublishMicrophone) {
        const settings = loadCampfireMediaSettings();
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: audioInputConstraint(settings.audioInputId, settings.audioProfile),
          video: false,
        });
        const micTrack = micStream.getAudioTracks()[0];
        if (micTrack) {
          const publication = await room.localParticipant.publishTrack(micTrack, {
            source: Track.Source.Microphone,
            ...(settings.audioProfile === "studio"
              ? { audioPreset: AudioPresets.musicHighQualityStereo, forceStereo: true, dtx: false }
              : { audioPreset: AudioPresets.speech, forceStereo: false, dtx: true }),
            red: true,
          } as never);
          micStreamRef.current = micStream;
          micPublicationRef.current = publication;
        }
      }
      setConnected(true);
    } catch (connectError) {
      const message = errorText(connectError);
      setError(message);
      await cleanupMedia();
    } finally {
      setConnecting(false);
    }
  }, [addRemoteTrack, campfireId, cleanupMedia, removeRemoteTrack]);

  useEffect(() => {
    if (!active) {
      setSession(null);
      void cleanupMedia();
      return;
    }
    void refresh();
    const channel = supabase
      .channel(`direct-call-ui:${currentUserId}:${campfireId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "direct_call_sessions",
      }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<RawDirectCall>;
        if (row.campfire_id !== campfireId) return;
        if (row.caller_id !== currentUserId && row.callee_id !== currentUserId) return;
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      void cleanupMedia();
    };
  }, [active, campfireId, cleanupMedia, currentUserId, refresh]);

  useEffect(() => {
    if (!session) return;
    if (session.status === "active") {
      void connectMedia(session);
    } else if (session.status === "declined" || session.status === "ended") {
      void cleanupMedia();
    }
  }, [cleanupMedia, connectMedia, session?.id, session?.status]);

  const startCall = useCallback(async (targetUserId: string): Promise<Result> => {
    if (!active) return { ok: false, message: "Esta Campfire não está ativa." };
    if (!targetUserId || targetUserId === currentUserId) return { ok: false, message: "Selecione outro usuário." };
    try {
      const { data, error: rpcError } = await supabase.rpc("start_direct_call", {
        p_campfire_id: campfireId,
        p_target_user_id: targetUserId,
      });
      if (rpcError) throw rpcError;
      if (typeof data !== "string") throw new Error("O banco não retornou o ID da chamada.");
      await refresh();
      return { ok: true, message: "Chamando…" };
    } catch (callError) {
      const message = errorText(callError);
      setError(message);
      return { ok: false, message };
    }
  }, [active, campfireId, currentUserId, refresh]);

  const respond = useCallback(async (accept: boolean): Promise<Result> => {
    const current = sessionRef.current;
    if (!current) return { ok: false, message: "Não há chamada para responder." };
    try {
      const { error: rpcError } = await supabase.rpc("respond_direct_call", {
        p_call_id: current.id,
        p_accept: accept,
      });
      if (rpcError) throw rpcError;
      await refresh();
      return { ok: true, message: accept ? "Chamada aceita." : "Chamada recusada." };
    } catch (callError) {
      const message = errorText(callError); setError(message); return { ok: false, message };
    }
  }, [refresh]);

  const endCall = useCallback(async (): Promise<Result> => {
    const current = sessionRef.current;
    if (!current) {
      await cleanupMedia();
      return { ok: true, message: "Chamada encerrada." };
    }
    try {
      const { error: rpcError } = await supabase.rpc("end_direct_call", { p_call_id: current.id });
      if (rpcError) throw rpcError;
      setSession(null); sessionRef.current = null;
      await cleanupMedia();
      return { ok: true, message: "Chamada encerrada." };
    } catch (callError) {
      const message = errorText(callError); setError(message); return { ok: false, message };
    }
  }, [cleanupMedia]);

  const toggleMute = useCallback((): Result => {
    const publication = micPublicationRef.current;
    if (!publication) return { ok: false, message: "Microfone indisponível." };
    const next = !muted;
    if (next) publication.mute(); else publication.unmute();
    const track = publication.track?.mediaStreamTrack;
    if (track) track.enabled = !next;
    setMuted(next);
    return { ok: true, message: next ? "Microfone silenciado." : "Microfone ativado." };
  }, [muted]);

  const toggleCamera = useCallback(async (): Promise<Result> => {
    const room = roomRef.current;
    if (!room || !connected) return { ok: false, message: "A chamada ainda não está conectada." };
    if (cameraEnabled) {
      const publication = cameraPublicationRef.current;
      if (publication?.track) await room.localParticipant.unpublishTrack(publication.track, true);
      cameraPublicationRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setLocalCameraStream(null);
      setCameraEnabled(false);
      return { ok: true, message: "Webcam desligada." };
    }
    try {
      const settings = loadCampfireMediaSettings();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoInputConstraint(settings.videoInputId, settings.videoQuality),
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("Nenhuma webcam foi encontrada.");
      const publication = await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        simulcast: true,
        videoCodec: "vp9",
      } as never);
      cameraPublicationRef.current = publication;
      cameraStreamRef.current = stream;
      setLocalCameraStream(stream);
      setCameraEnabled(true);
      return { ok: true, message: "Webcam ligada." };
    } catch (cameraError) {
      const message = errorText(cameraError); setError(message); return { ok: false, message };
    }
  }, [cameraEnabled, connected]);

  const otherUserId = session
    ? (session.callerId === currentUserId ? session.calleeId : session.callerId)
    : null;
  const incoming = Boolean(session && session.status === "ringing" && session.calleeId === currentUserId);
  const outgoing = Boolean(session && session.status === "ringing" && session.callerId === currentUserId);

  return {
    session,
    otherUserId,
    incoming,
    outgoing,
    connecting,
    connected,
    muted,
    cameraEnabled,
    remoteStream,
    localCameraStream,
    error,
    startCall,
    accept: () => respond(true),
    decline: () => respond(false),
    endCall,
    toggleMute,
    toggleCamera,
    refresh,
  };
}
