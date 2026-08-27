import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AudioPresets,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { supabase } from "./lib/supabase";
import {
  CAMPFIRE_MEDIA_SETTINGS_EVENT,
  loadCampfireMediaSettings,
  saveCampfireMediaSettings,
  videoInputConstraint,
  type CampfireAudioProfile,
  type CampfireVoiceProfile,
} from "./campfireMediaSettings";
import {
  createCampfireVoicePipeline,
  type CampfireVoicePipeline,
} from "./media/campfireVoicePipeline";
import { campfireAnalyserLevel } from "./media/voiceProcessing";
import { requestCampfireMediaToken } from "./media/livekitToken";
import {
  CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT,
  getUserLocalMediaPreference,
} from "./userLocalMediaPreferences";

export type CampfirePresenceStatus = "online" | "away" | "busy" | "offline";
export type CampfirePresenceMember = {
  userId: string;
  status: CampfirePresenceStatus;
  personalMessage: string;
  hasCamera: boolean;
  hasMicrophone: boolean;
  voiceJoined: boolean;
  cameraEnabled: boolean;
  micEnabled: boolean;
  updatedAt: string;
};
export type CampfireVoiceActionResult = { ok: boolean; message: string };
export type CampfireVoiceController = ReturnType<typeof useCampfireLiveKitVoice>;

type PresencePayload = Partial<CampfirePresenceMember>;
type PlaybackNode = { source: MediaStreamAudioSourceNode; gain: GainNode };
type SinkAudioContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

const STATUS_MESSAGE_KEY = "campfire.presence.personalMessage";
const USER_VOLUME_KEY = "campfire.voice.userVolumes.v1";
const OUTGOING_VOLUME_KEY = "campfire.voice.outgoingVolume.v1";
const MONITOR_VOLUME_KEY = "campfire.voice.monitorVolume.v1";
const METER_INTERVAL_MS = 50;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(200, Math.round(value)));
}

function loadNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? clampVolume(value) : fallback;
  } catch {
    return fallback;
  }
}
function loadUserVolumes(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_VOLUME_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "number" ? [[key, clampVolume(value)]] : []
      )
    );
  } catch {
    return {};
  }
}
function normalizeStatus(value: unknown): CampfirePresenceStatus {
  return value === "away" || value === "busy" || value === "offline" ? value : "online";
}
function normalizePresence(raw: PresencePayload, fallbackUserId: string): CampfirePresenceMember {
  return {
    userId: typeof raw.userId === "string" ? raw.userId : fallbackUserId,
    status: normalizeStatus(raw.status),
    personalMessage: typeof raw.personalMessage === "string" ? raw.personalMessage.slice(0, 120) : "",
    hasCamera: raw.hasCamera === true,
    hasMicrophone: raw.hasMicrophone === true,
    voiceJoined: raw.voiceJoined === true,
    cameraEnabled: raw.cameraEnabled === true,
    micEnabled: raw.micEnabled !== false,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Falha de mídia.");
  }
  return "Não foi possível concluir a operação de mídia.";
}

export function useCampfireLiveKitVoice(
  campfireId: string,
  currentUserId: string,
  initialStatus: string,
  active = true
) {
  const [status, setStatusState] = useState<CampfirePresenceStatus>(normalizeStatus(initialStatus));
  const [personalMessage, setPersonalMessageState] = useState(() => {
    try { return (localStorage.getItem(`${STATUS_MESSAGE_KEY}.${currentUserId}`) ?? "").slice(0, 120); }
    catch { return ""; }
  });
  const [presence, setPresence] = useState<Record<string, CampfirePresenceMember>>({});
  const [signalingReady, setSignalingReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [error, setError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(loadUserVolumes);
  const [outgoingVolume, setOutgoingVolumeState] = useState(() => loadNumber(OUTGOING_VOLUME_KEY, 100));
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorVolume, setMonitorVolumeState] = useState(() => loadNumber(MONITOR_VOLUME_KEY, 100));
  const [voiceProfile, setVoiceProfileState] = useState<CampfireVoiceProfile>(() =>
    loadCampfireMediaSettings().voiceProfile
  );
  const [rnnoiseActive, setRnnoiseActive] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [processedLevel, setProcessedLevel] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const microphonePipelineRef = useRef<CampfireVoicePipeline | null>(null);
  const meterFrameRef = useRef(0);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micPublicationRef = useRef<LocalTrackPublication | null>(null);
  const cameraPublicationRef = useRef<LocalTrackPublication | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackNodesRef = useRef(new Map<string, PlaybackNode>());
  const userVolumesRef = useRef(userVolumes);
  const joinedRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const muteBeforeDeafenRef = useRef(false);
  const cameraEnabledRef = useRef(false);
  const statusRef = useRef(status);
  const personalMessageRef = useRef(personalMessage);
  const hasCameraRef = useRef(false);
  const hasMicrophoneRef = useRef(false);
  const permissionsRef = useRef({
    canPublishMicrophone: true,
    canPublishCamera: true,
    canPublishScreen: false,
    canSubscribe: true,
  });

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { personalMessageRef.current = personalMessage; }, [personalMessage]);
  useEffect(() => { joinedRef.current = joined; }, [joined]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { deafenedRef.current = deafened; }, [deafened]);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);
  useEffect(() => { userVolumesRef.current = userVolumes; }, [userVolumes]);


  useEffect(() => {
    if (!joined) {
      if (meterFrameRef.current) {
        window.cancelAnimationFrame(meterFrameRef.current);
        meterFrameRef.current = 0;
      }
      setInputLevel(0);
      setProcessedLevel(0);
      return;
    }

    let lastUpdate = 0;
    let lastOriginalAnalyser: AnalyserNode | null = null;
    let lastProcessedAnalyser: AnalyserNode | null = null;
    let originalData: Float32Array<ArrayBuffer> | null = null;
    let processedData: Float32Array<ArrayBuffer> | null = null;

    const updateMeters = (timestamp: number) => {
      const pipeline = microphonePipelineRef.current;

      if (pipeline && timestamp - lastUpdate >= METER_INTERVAL_MS) {
        if (lastOriginalAnalyser !== pipeline.originalAnalyser) {
          lastOriginalAnalyser = pipeline.originalAnalyser;
          originalData = new Float32Array(
            pipeline.originalAnalyser.fftSize
          );
        }
        if (lastProcessedAnalyser !== pipeline.processedAnalyser) {
          lastProcessedAnalyser = pipeline.processedAnalyser;
          processedData = new Float32Array(
            pipeline.processedAnalyser.fftSize
          );
        }

        if (originalData) {
          setInputLevel(
            campfireAnalyserLevel(
              pipeline.originalAnalyser,
              originalData
            )
          );
        }
        if (processedData) {
          setProcessedLevel(
            campfireAnalyserLevel(
              pipeline.processedAnalyser,
              processedData
            )
          );
        }
        lastUpdate = timestamp;
      }

      meterFrameRef.current = window.requestAnimationFrame(updateMeters);
    };

    meterFrameRef.current = window.requestAnimationFrame(updateMeters);

    return () => {
      if (meterFrameRef.current) {
        window.cancelAnimationFrame(meterFrameRef.current);
        meterFrameRef.current = 0;
      }
    };
  }, [joined]);

  const publishPresence = useCallback(async () => {
    const channel = presenceChannelRef.current;
    if (!active || !channel || !subscribedRef.current) return;
    if (statusRef.current === "offline" && !joinedRef.current) {
      await channel.untrack();
      return;
    }
    await channel.track({
      userId: currentUserId,
      status: statusRef.current,
      personalMessage: personalMessageRef.current,
      hasCamera: hasCameraRef.current,
      hasMicrophone: hasMicrophoneRef.current,
      voiceJoined: joinedRef.current,
      cameraEnabled: cameraEnabledRef.current,
      micEnabled: joinedRef.current && !mutedRef.current && permissionsRef.current.canPublishMicrophone,
      updatedAt: new Date().toISOString(),
    });
  }, [active, currentUserId]);

  const detectDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      const nextCamera = devices?.some((device) => device.kind === "videoinput") ?? false;
      const nextMicrophone = devices?.some((device) => device.kind === "audioinput") ?? false;
      setHasCamera(nextCamera); setHasMicrophone(nextMicrophone);
      hasCameraRef.current = nextCamera; hasMicrophoneRef.current = nextMicrophone;
      await publishPresence();
    } catch (deviceError) {
      console.warn("Campfire LiveKit: enumerateDevices", deviceError);
    }
  }, [publishPresence]);

  useEffect(() => {
    if (!active) return;
    void detectDevices();
    const handler = () => void detectDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
  }, [active, detectDevices]);

  useEffect(() => {
    if (!active) {
      subscribedRef.current = false;
      presenceChannelRef.current = null;
      setSignalingReady(false);
      setPresence({});
      return;
    }

    let disposed = false;
    let channel: RealtimeChannel | null = null;
    const topic = `campfire-voice:${campfireId}`;

    async function initializeChannel() {
      try {
        /*
         * React StrictMode remonta efeitos durante o desenvolvimento.
         * O Supabase pode ainda manter a instância anterior do MESMO
         * tópico em joining/joined; registrar listeners novamente nesse
         * canal pode derrubar o renderer. Limpamos a instância local
         * antiga antes de recriar o tópico compartilhado de presença.
         */
        const existingChannels = supabase
          .getChannels()
          .filter((item) => String(item.topic).endsWith(topic));

        for (const existing of existingChannels) {
          try {
            await existing.unsubscribe();
          } catch {
            // best effort: a nova instância ainda será criada abaixo.
          }
        }

        if (disposed) return;

        channel = supabase.channel(topic, {
          config: {
            private: true,
            presence: { key: currentUserId },
          },
        });
        presenceChannelRef.current = channel;

        channel
          .on("presence", { event: "sync" }, () => {
            if (disposed || !channel) return;
            const state = channel.presenceState<PresencePayload>();
            const next: Record<string, CampfirePresenceMember> = {};
            for (const [key, entries] of Object.entries(state)) {
              const entry = entries[entries.length - 1] as PresencePayload | undefined;
              if (entry) next[key] = normalizePresence(entry, key);
            }
            setPresence(next);
          })
          .subscribe((subscriptionStatus) => {
            if (disposed) return;
            const ready = subscriptionStatus === "SUBSCRIBED";
            subscribedRef.current = ready;
            setSignalingReady(ready);
            if (ready) void publishPresence();
          });
      } catch (channelError) {
        if (disposed) return;
        subscribedRef.current = false;
        setSignalingReady(false);
        setError(errorMessage(channelError));
        console.error("Campfire LiveKit: falha iniciando presença", channelError);
      }
    }

    void initializeChannel();

    return () => {
      disposed = true;
      subscribedRef.current = false;
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [active, campfireId, currentUserId, publishPresence]);

  const closePlaybackForUser = useCallback((userId: string) => {
    const node = playbackNodesRef.current.get(userId);
    if (node) {
      try { node.source.disconnect(); node.gain.disconnect(); } catch { /* best effort */ }
      playbackNodesRef.current.delete(userId);
    }
  }, []);

  const ensurePlaybackContext = useCallback(async () => {
    let context = playbackAudioContextRef.current;
    if (!context) { context = new AudioContext(); playbackAudioContextRef.current = context; }
    if (deafenedRef.current) {
      if (context.state === "running") await context.suspend().catch(() => undefined);
    } else if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    const outputId = loadCampfireMediaSettings().audioOutputId;
    const sinkContext = context as SinkAudioContext;
    if (outputId && typeof sinkContext.setSinkId === "function") {
      await sinkContext.setSinkId(outputId).catch(() => undefined);
    }
    return context;
  }, []);

  const attachRemotePlayback = useCallback(async (userId: string, stream: MediaStream) => {
    closePlaybackForUser(userId);
    if (!stream.getAudioTracks().length) return;
    const context = await ensurePlaybackContext();
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = deafenedRef.current ? 0 : (userVolumesRef.current[userId] ?? 100) / 100;
    source.connect(gain); gain.connect(context.destination);
    playbackNodesRef.current.set(userId, { source, gain });
  }, [closePlaybackForUser, ensurePlaybackContext]);

  const upsertRemoteTrack = useCallback((track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const userId = participant.identity;
    setRemoteStreams((current) => {
      const stream = current[userId] ? new MediaStream(current[userId].getTracks()) : new MediaStream();
      const mediaTrack = track.mediaStreamTrack;
      if (!stream.getTracks().some((item) => item.id === mediaTrack.id)) stream.addTrack(mediaTrack);
      void attachRemotePlayback(userId, stream);
      return { ...current, [userId]: stream };
    });
  }, [attachRemotePlayback]);

  const removeRemoteTrack = useCallback((track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const userId = participant.identity;
    setRemoteStreams((current) => {
      const existing = current[userId];
      if (!existing) return current;
      const stream = new MediaStream(existing.getTracks().filter((item) => item.id !== track.mediaStreamTrack.id));
      if (!stream.getTracks().length) {
        const next = { ...current }; delete next[userId]; closePlaybackForUser(userId); return next;
      }
      void attachRemotePlayback(userId, stream);
      return { ...current, [userId]: stream };
    });
  }, [attachRemotePlayback, closePlaybackForUser]);

  const applyLocalVideoPreference = useCallback((userId: string) => {
    const participant = roomRef.current?.remoteParticipants.get(userId);
    if (!participant) return;
    const { videoHidden } = getUserLocalMediaPreference(userId);
    participant.getTrackPublication(Track.Source.Camera)?.setSubscribed(!videoHidden);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId) return;
      applyLocalVideoPreference(detail.userId);
      const nextVolume = getUserVolume(detail.userId);
      userVolumesRef.current = { ...userVolumesRef.current, [detail.userId]: nextVolume };
      setUserVolumes(userVolumesRef.current);
      const node = playbackNodesRef.current.get(detail.userId);
      if (node) node.gain.gain.value = deafenedRef.current ? 0 : nextVolume / 100;
    };
    window.addEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
  }, [applyLocalVideoPreference]);

  const cleanupRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setReconnecting(false);
    if (room) room.disconnect();
    for (const node of playbackNodesRef.current.values()) {
      try { node.source.disconnect(); node.gain.disconnect(); } catch { /* best effort */ }
    }
    playbackNodesRef.current.clear();
    setRemoteStreams({});
    micPublicationRef.current = null;
    cameraPublicationRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    const pipeline = microphonePipelineRef.current;
    microphonePipelineRef.current = null;
    setRnnoiseActive(false);
    await pipeline?.dispose();
  }, []);

  const createCurrentMicrophonePipeline = useCallback(async () => {
    return createCampfireVoicePipeline({
      settings: loadCampfireMediaSettings(),
      outgoingVolume,
      monitorEnabled,
      monitorVolume,
    });
  }, [monitorEnabled, monitorVolume, outgoingVolume]);

  const refreshPublishedMicrophone = useCallback(async () => {
    const publication = micPublicationRef.current;
    const localTrack = publication?.track;

    if (
      !joinedRef.current ||
      !roomRef.current ||
      !permissionsRef.current.canPublishMicrophone ||
      !localTrack
    ) {
      return;
    }

    const previous = microphonePipelineRef.current;
    const next = await createCurrentMicrophonePipeline();
    next.setMuted(mutedRef.current);

    try {
      await localTrack.replaceTrack(next.processedTrack, true);
      microphonePipelineRef.current = next;
      setRnnoiseActive(next.rnnoiseActive);
      await previous?.dispose();

      if (mutedRef.current) {
        await publication.mute();
      } else {
        await publication.unmute();
      }

      setError("");
    } catch (switchError) {
      await next.dispose();
      const message = errorMessage(switchError);
      setError(`Não foi possível trocar o microfone: ${message}`);
      throw switchError;
    }
  }, [createCurrentMicrophonePipeline]);

  const publishMicrophone = useCallback(async (room: Room) => {
    if (!permissionsRef.current.canPublishMicrophone) return;

    const settings = loadCampfireMediaSettings();
    const pipeline = await createCurrentMicrophonePipeline();
    pipeline.setMuted(mutedRef.current);

    try {
      const publication = await room.localParticipant.publishTrack(
        pipeline.processedTrack,
        {
          source: Track.Source.Microphone,
          ...(settings.voiceProfile === "studio"
            ? {
                audioPreset: AudioPresets.musicHighQualityStereo,
                forceStereo: true,
                dtx: false,
              }
            : {
                audioPreset: AudioPresets.speech,
                forceStereo: false,
                dtx: true,
              }),
          red: true,
        } as never
      );

      microphonePipelineRef.current = pipeline;
      micPublicationRef.current = publication;
      setRnnoiseActive(pipeline.rnnoiseActive);
      if (mutedRef.current) await publication.mute();
    } catch (publishError) {
      await pipeline.dispose();
      throw publishError;
    }
  }, [createCurrentMicrophonePipeline]);

  const applyMute = useCallback(async (next: boolean) => {
    mutedRef.current = next;
    setMuted(next);

    const pipeline = microphonePipelineRef.current;
    pipeline?.setMuted(next);

    const publication = micPublicationRef.current;
    if (publication) {
      if (next) await publication.mute();
      else await publication.unmute();
    }

    await publishPresence();
  }, [publishPresence]);

  const applyDeafenPlayback = useCallback(async (next: boolean) => {
    for (const [userId, node] of playbackNodesRef.current) {
      node.gain.gain.value = next
        ? 0
        : (userVolumesRef.current[userId] ?? 100) / 100;
    }

    const context = playbackAudioContextRef.current;
    if (!context) return;
    if (next) await context.suspend().catch(() => undefined);
    else await context.resume().catch(() => undefined);
  }, []);

  const joinVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!active) return { ok: false, message: "Esta Campfire não está ativa." };
    if (joinedRef.current) return { ok: true, message: "Você já está na voz." };
    setJoining(true); setError("");
    try {
      const credentials = await requestCampfireMediaToken({ campfireId, purpose: "voice" });
      permissionsRef.current = credentials.permissions;
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        stopLocalTrackOnUnpublish: true,
      });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, upsertRemoteTrack);
      room.on(RoomEvent.TrackUnsubscribed, removeRemoteTrack);
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        applyLocalVideoPreference(participant.identity);
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        closePlaybackForUser(participant.identity);
        setRemoteStreams((current) => { const next = { ...current }; delete next[participant.identity]; return next; });
      });
      room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
      room.on(RoomEvent.Reconnected, () => {
        setReconnecting(false);
        void applyMute(mutedRef.current);
        void applyDeafenPlayback(deafenedRef.current);
      });
      room.on(RoomEvent.Disconnected, () => { setJoined(false); joinedRef.current = false; setReconnecting(false); void publishPresence(); });
      await room.connect(credentials.url, credentials.token);
      for (const participant of room.remoteParticipants.values()) {
        applyLocalVideoPreference(participant.identity);
      }
      await ensurePlaybackContext();
      if (credentials.permissions.canPublishMicrophone) await publishMicrophone(room);
      joinedRef.current = true; setJoined(true);
      await applyMute(mutedRef.current);
      await applyDeafenPlayback(deafenedRef.current);
      await publishPresence();
      return {
        ok: true,
        message: credentials.permissions.canPublishMicrophone
          ? "Conectado à voz SFU do Campfire."
          : "Conectado em modo de escuta; seu microfone está bloqueado pelo owner.",
      };
    } catch (joinError) {
      await cleanupRoom();
      const message = errorMessage(joinError); setError(message); return { ok: false, message };
    } finally { setJoining(false); }
  }, [active, applyDeafenPlayback, applyLocalVideoPreference, applyMute, campfireId, cleanupRoom, closePlaybackForUser, ensurePlaybackContext, publishMicrophone, publishPresence, removeRemoteTrack, upsertRemoteTrack]);

  const leaveVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    joinedRef.current = false; setJoined(false); cameraEnabledRef.current = false; setCameraEnabled(false);
    await cleanupRoom(); await publishPresence();
    return { ok: true, message: "Você saiu da voz." };
  }, [cleanupRoom, publishPresence]);

  const toggleMute = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!joinedRef.current) return { ok: false, message: "Entre na voz primeiro." };
    if (!permissionsRef.current.canPublishMicrophone) return { ok: false, message: "Seu microfone está bloqueado pelo owner." };
    if (deafenedRef.current && mutedRef.current) {
      return { ok: false, message: "Reative o áudio antes de desmutar o microfone." };
    }
    const next = !mutedRef.current;
    await applyMute(next);
    return { ok: true, message: next ? "Microfone silenciado." : "Microfone ativado." };
  }, [applyMute]);

  const toggleCamera = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    const room = roomRef.current;
    if (!joinedRef.current || !room) return { ok: false, message: "Entre na voz primeiro." };
    if (!permissionsRef.current.canPublishCamera) return { ok: false, message: "Sua webcam está bloqueada pelo owner." };
    if (cameraEnabledRef.current) {
      const publication = cameraPublicationRef.current;
      if (publication?.track) await room.localParticipant.unpublishTrack(publication.track, true);
      cameraPublicationRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop()); cameraStreamRef.current = null;
      cameraEnabledRef.current = false; setCameraEnabled(false); await publishPresence();
      return { ok: true, message: "Webcam desligada." };
    }
    try {
      const settings = loadCampfireMediaSettings();
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoInputConstraint(settings.videoInputId, settings.videoQuality), audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("Nenhuma webcam foi encontrada.");
      const publication = await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        simulcast: true,
        videoCodec: "vp9",
      } as never);
      cameraPublicationRef.current = publication; cameraStreamRef.current = stream;
      cameraEnabledRef.current = true; setCameraEnabled(true); setHasCamera(true); hasCameraRef.current = true;
      await publishPresence();
      return { ok: true, message: "Webcam ligada em modo adaptativo." };
    } catch (cameraError) {
      const message = errorMessage(cameraError); setError(message); return { ok: false, message };
    }
  }, [publishPresence]);

  const toggleDeafen = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!joinedRef.current) return { ok: false, message: "Entre na voz primeiro." };
    const next = !deafenedRef.current;

    if (next) {
      muteBeforeDeafenRef.current = mutedRef.current;
      if (!mutedRef.current) await applyMute(true);
    }

    deafenedRef.current = next;
    setDeafened(next);
    await applyDeafenPlayback(next);

    if (!next && !muteBeforeDeafenRef.current) {
      await applyMute(false);
    }

    return {
      ok: true,
      message: next
        ? "Áudio desativado para você; seu microfone também foi silenciado."
        : "Áudio reativado.",
    };
  }, [applyDeafenPlayback, applyMute]);

  const setUserVolume = useCallback((userId: string, value: number) => {
    const nextValue = clampVolume(value);
    setUserVolumes((current) => {
      const next = { ...current, [userId]: nextValue }; userVolumesRef.current = next;
      try { localStorage.setItem(USER_VOLUME_KEY, JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
    const node = playbackNodesRef.current.get(userId);
    if (node) node.gain.gain.value = deafenedRef.current ? 0 : nextValue / 100;
  }, []);
  const getUserVolume = useCallback((userId: string) => userVolumesRef.current[userId] ?? 100, []);
  const setOutgoingVolume = useCallback((value: number) => {
    const next = clampVolume(value); setOutgoingVolumeState(next);
    try { localStorage.setItem(OUTGOING_VOLUME_KEY, String(next)); } catch { /* optional */ }
    microphonePipelineRef.current?.setOutgoingVolume(next);
  }, []);
  const setMonitorEnabledState = useCallback((enabled: boolean) => {
    setMonitorEnabled(enabled);
    microphonePipelineRef.current?.setMonitor(enabled, monitorVolume);
  }, [monitorVolume]);
  const setMonitorVolume = useCallback((value: number) => {
    const next = clampVolume(value); setMonitorVolumeState(next);
    try { localStorage.setItem(MONITOR_VOLUME_KEY, String(next)); } catch { /* optional */ }
    microphonePipelineRef.current?.setMonitor(monitorEnabled, next);
  }, [monitorEnabled]);

  const setVoiceProfile = useCallback((profile: CampfireVoiceProfile): CampfireVoiceActionResult => {
    const next: CampfireVoiceProfile =
      profile === "strong" || profile === "studio"
        ? profile
        : "clean";
    const settings = loadCampfireMediaSettings();
    saveCampfireMediaSettings({
      ...settings,
      voiceProfile: next,
      audioProfile: next === "studio" ? "studio" : "voice",
    });
    setVoiceProfileState(next);
    return {
      ok: true,
      message: joinedRef.current
        ? `Modo ${next === "studio" ? "Studio / Hi-Fi" : next === "strong" ? "Supressão forte" : "Voz limpa"} salvo e aplicado ao microfone ativo.`
        : `Modo ${next === "studio" ? "Studio / Hi-Fi" : next === "strong" ? "Supressão forte" : "Voz limpa"} selecionado.`,
    };
  }, []);

  const setAudioProfile = useCallback((profile: CampfireAudioProfile): CampfireVoiceActionResult => {
    return setVoiceProfile(profile === "studio" ? "studio" : "clean");
  }, [setVoiceProfile]);

  const setStatus = useCallback(async (nextStatus: CampfirePresenceStatus) => {
    setStatusState(nextStatus); statusRef.current = nextStatus;
    await supabase.from("profiles").update({ status: nextStatus }).eq("id", currentUserId).then(() => undefined);
    window.dispatchEvent(new CustomEvent("campfire-profile-presence-change", { detail: { status: nextStatus, personalMessage: personalMessageRef.current } }));
    await publishPresence();
  }, [currentUserId, publishPresence]);
  const setPersonalMessage = useCallback(async (value: string) => {
    const next = value.slice(0, 120); setPersonalMessageState(next); personalMessageRef.current = next;
    try { localStorage.setItem(`${STATUS_MESSAGE_KEY}.${currentUserId}`, next); } catch { /* optional */ }
    await supabase.from("profiles").update({ status_message: next || null }).eq("id", currentUserId).then(() => undefined);
    window.dispatchEvent(new CustomEvent("campfire-profile-presence-change", { detail: { status: statusRef.current, personalMessage: next } }));
    await publishPresence();
  }, [currentUserId, publishPresence]);

  const lastMediaSettingsRef = useRef(loadCampfireMediaSettings());

  useEffect(() => {
    const handler = (event: Event) => {
      const next =
        (event as CustomEvent<ReturnType<typeof loadCampfireMediaSettings>>).detail ??
        loadCampfireMediaSettings();
      const previous = lastMediaSettingsRef.current;
      lastMediaSettingsRef.current = next;

      void detectDevices();

      if (previous.audioOutputId !== next.audioOutputId) {
        void ensurePlaybackContext();
      }

      setVoiceProfileState(next.voiceProfile);

      if (
        previous.audioInputId !== next.audioInputId ||
        previous.voiceProfile !== next.voiceProfile ||
        previous.echoCancellation !== next.echoCancellation ||
        previous.nativeNoiseSuppression !== next.nativeNoiseSuppression ||
        previous.autoGainControl !== next.autoGainControl ||
        previous.gateMode !== next.gateMode ||
        previous.gateSensitivity !== next.gateSensitivity
      ) {
        void refreshPublishedMicrophone().catch(() => undefined);
      }
    };

    window.addEventListener(CAMPFIRE_MEDIA_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(CAMPFIRE_MEDIA_SETTINGS_EVENT, handler);
  }, [
    detectDevices,
    ensurePlaybackContext,
    refreshPublishedMicrophone,
  ]);

  useEffect(() => () => { void cleanupRoom(); }, [cleanupRoom]);

  const voiceMembers = useMemo(
    () => Object.values(presence).filter((member) => member.voiceJoined),
    [presence]
  );

  return {
    status, personalMessage, presence, signalingReady,
    joined, joining, muted, deafened, cameraEnabled, hasCamera, hasMicrophone, error,
    reconnecting,
    remoteStreams, localCameraStream: cameraStreamRef.current, voiceMembers,
    outgoingVolume, monitorEnabled, monitorVolume,
    voiceProfile, rnnoiseActive, inputLevel, processedLevel,
    audioProfile: voiceProfile === "studio" ? "studio" : "voice",
    setStatus, setPersonalMessage, detectDevices,
    joinVoice, leaveVoice, toggleMute, toggleCamera, toggleDeafen,
    getUserVolume, setUserVolume, setOutgoingVolume,
    setMonitorEnabled: setMonitorEnabledState, setMonitorVolume,
    setVoiceProfile, setAudioProfile,
  };
}
