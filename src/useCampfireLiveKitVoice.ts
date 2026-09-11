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
import {
  createCampfireRemoteAudioMixer,
  type CampfireRemoteAudioMixer,
} from "./campfireRemoteAudioMixer";
import {
  CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT,
  isCampfireVoiceTypingTarget,
  loadCampfireVoiceInputSettings,
  matchesCampfirePushToTalkBinding,
  type CampfireVoiceInputSettings,
} from "./campfireVoiceInputMode";
import { requestCampfireMediaToken } from "./media/livekitToken";
import { campfireConnectionId } from "./web/platform";
import {
  CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT,
  getUserLocalMediaPreference,
} from "./userLocalMediaPreferences";
import {
  enforceSingleMicrophonePublication,
  snapshotCampfireVoicePublications,
} from "./campfireVoiceDiagnostics";

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
export type CampfireVoicePhase =
  | "disconnected"
  | "connecting"
  | "connected-listener"
  | "publishing-microphone"
  | "connected-speaking"
  | "reconnecting"
  | "microphone-unavailable"
  | "error";
export type CampfireVoiceErrorCode =
  | "token"
  | "network"
  | "microphone-permission"
  | "microphone-device"
  | "playback-subscription"
  | "unknown";
export type CampfireVoiceController = ReturnType<typeof useCampfireLiveKitVoice>;

type PresencePayload = Partial<CampfirePresenceMember>;

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
function principalIdFromParticipant(participant: Pick<RemoteParticipant, "identity" | "metadata">): string {
  try {
    const metadata = participant.metadata ? JSON.parse(participant.metadata) as { principalId?: unknown } : null;
    if (metadata && typeof metadata.principalId === "string" && metadata.principalId) return metadata.principalId;
  } catch {
    // Old clients may not publish JSON metadata.
  }
  const separator = participant.identity.indexOf(":");
  return separator > 0 ? participant.identity.slice(0, separator) : participant.identity;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Falha de mídia.");
  }
  return "Não foi possível concluir a operação de mídia.";
}

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
}

function classifyMicrophoneError(error: unknown): CampfireVoiceErrorCode {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "microphone-permission";
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError" ||
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  ) {
    return "microphone-device";
  }
  return "microphone-device";
}

export function useCampfireLiveKitVoice(
  campfireId: string | null,
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
  const [errorCode, setErrorCode] = useState<CampfireVoiceErrorCode | null>(null);
  const [phase, setPhase] = useState<CampfireVoicePhase>("disconnected");
  const [reconnecting, setReconnecting] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [speakingParticipantIds, setSpeakingParticipantIds] = useState<ReadonlySet<string>>(() => new Set());
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(loadUserVolumes);
  const [participantLocalMutes, setParticipantLocalMutes] = useState<Record<string, boolean>>({});
  const [outgoingVolume, setOutgoingVolumeState] = useState(() => loadNumber(OUTGOING_VOLUME_KEY, 100));
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorVolume, setMonitorVolumeState] = useState(() => loadNumber(MONITOR_VOLUME_KEY, 100));
  const [voiceProfile, setVoiceProfileState] = useState<CampfireVoiceProfile>(() =>
    loadCampfireMediaSettings().voiceProfile
  );
  const [rnnoiseActive, setRnnoiseActive] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [processedLevel, setProcessedLevel] = useState(0);

  const [voiceInputSettings, setVoiceInputSettings] =
    useState<CampfireVoiceInputSettings>(loadCampfireVoiceInputSettings);
  const [pushToTalkHeld, setPushToTalkHeld] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const microphonePipelineRef = useRef<CampfireVoicePipeline | null>(null);
  const meterFrameRef = useRef(0);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micPublicationRef = useRef<LocalTrackPublication | null>(null);
  const cameraPublicationRef = useRef<LocalTrackPublication | null>(null);
  const leaseHeartbeatRef = useRef<number | null>(null);
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);
  const connectedCampfireIdRef = useRef<string | null>(null);
  const mediaConnectionId = useMemo(() => campfireConnectionId(), []);
  const remoteAudioMixerRef = useRef<CampfireRemoteAudioMixer | null>(null);
  const mediaRefreshSuppressedRef = useRef(false);
  const voiceInputSettingsRef = useRef(voiceInputSettings);
  const pushToTalkHeldRef = useRef(false);
  const userVolumesRef = useRef(userVolumes);
  const joinedRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const preDeafenMutedRef = useRef(false);
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
  useEffect(() => { voiceInputSettingsRef.current = voiceInputSettings; }, [voiceInputSettings]);
  useEffect(() => { pushToTalkHeldRef.current = pushToTalkHeld; }, [pushToTalkHeld]);

  const microphoneGateMuted = useCallback((): boolean => {
    const input = voiceInputSettingsRef.current;
    const pushToTalkClosed =
      input.mode === "push-to-talk" &&
      (!input.binding || !pushToTalkHeldRef.current);
    return mutedRef.current || deafenedRef.current || pushToTalkClosed;
  }, []);

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
      micEnabled:
        joinedRef.current &&
        Boolean(micPublicationRef.current) &&
        !microphoneGateMuted() &&
        permissionsRef.current.canPublishMicrophone,
      updatedAt: new Date().toISOString(),
    });
  }, [active, currentUserId, microphoneGateMuted]);

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
    if (!active || !campfireId) {
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

  const ensurePlaybackContext = useCallback(async () => {
    const mixer = remoteAudioMixerRef.current;
    if (!mixer) return null;
    await mixer.setOutputDevice(loadCampfireMediaSettings().audioOutputId);
    return null;
  }, []);

  const upsertRemoteTrack = useCallback((track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const userId = principalIdFromParticipant(participant);
    const room = roomRef.current;

    if (
      room &&
      participant.identity !== room.localParticipant.identity &&
      publication.source === Track.Source.Microphone
    ) {
      try {
        const mixer = remoteAudioMixerRef.current;
        mixer?.setVolume(userId, userVolumesRef.current[userId] ?? 100);
        mixer?.attach(userId, publication.trackSid, track.mediaStreamTrack);
      } catch (playbackError) {
        setErrorCode("playback-subscription");
        setError(errorMessage(playbackError));
      }
    }

    setRemoteStreams((current) => {
      const stream = current[userId]
        ? new MediaStream(current[userId].getTracks())
        : new MediaStream();
      const mediaTrack = track.mediaStreamTrack;
      if (!stream.getTracks().some((item) => item.id === mediaTrack.id)) {
        stream.addTrack(mediaTrack);
      }
      return { ...current, [userId]: stream };
    });
  }, []);

  const removeRemoteTrack = useCallback((track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const userId = principalIdFromParticipant(participant);
    if (publication.source === Track.Source.Microphone) {
      remoteAudioMixerRef.current?.detach(userId, publication.trackSid);
    }
    setRemoteStreams((current) => {
      const existing = current[userId];
      if (!existing) return current;
      const stream = new MediaStream(
        existing.getTracks().filter((item) => item.id !== track.mediaStreamTrack.id)
      );
      if (!stream.getTracks().length) {
        const next = { ...current };
        delete next[userId];
        return next;
      }
      return { ...current, [userId]: stream };
    });
  }, []);

  const applyLocalVideoPreference = useCallback((userId: string) => {
    const room = roomRef.current;
    if (!room) return;
    const { videoHidden } = getUserLocalMediaPreference(userId);
    for (const participant of room.remoteParticipants.values()) {
      if (principalIdFromParticipant(participant) !== userId) continue;
      participant.getTrackPublication(Track.Source.Camera)?.setSubscribed(!videoHidden);
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId) return;
      applyLocalVideoPreference(detail.userId);
      const nextVolume = getUserVolume(detail.userId);
      userVolumesRef.current = { ...userVolumesRef.current, [detail.userId]: nextVolume };
      setUserVolumes(userVolumesRef.current);
      remoteAudioMixerRef.current?.setVolume(detail.userId, nextVolume);
    };
    window.addEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
  }, [applyLocalVideoPreference]);

  const cleanupRoom = useCallback(async () => {
    if (leaseHeartbeatRef.current !== null) {
      window.clearInterval(leaseHeartbeatRef.current);
      leaseHeartbeatRef.current = null;
    }
    const connectedCampfireId = connectedCampfireIdRef.current;
    connectedCampfireIdRef.current = null;
    if (connectedCampfireId) {
      try {
        await supabase.rpc("release_campfire_media_lease", {
          p_campfire_id: connectedCampfireId,
          p_purpose: "voice",
          p_connection_id: mediaConnectionId,
        });
      } catch {
        // Lease expires server-side if the browser closes abruptly.
      }
    }
    const room = roomRef.current;
    roomRef.current = null;
    setReconnecting(false);
    if (room) room.disconnect();
    remoteAudioMixerRef.current?.dispose();
    remoteAudioMixerRef.current = null;
    setRemoteStreams({});
    setSpeakingParticipantIds(new Set());
    micPublicationRef.current = null;
    cameraPublicationRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    const pipeline = microphonePipelineRef.current;
    microphonePipelineRef.current = null;
    setRnnoiseActive(false);
    await pipeline?.dispose();
  }, [mediaConnectionId]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (disconnectPromiseRef.current) return disconnectPromiseRef.current;

    disconnectPromiseRef.current = (async () => {
      joinedRef.current = false;
      setJoined(false);
      setJoining(false);
      cameraEnabledRef.current = false;
      setCameraEnabled(false);
      await cleanupRoom();
      setPhase("disconnected");
      await publishPresence();
    })().finally(() => {
      disconnectPromiseRef.current = null;
    });

    return disconnectPromiseRef.current;
  }, [cleanupRoom, publishPresence]);

  const createCurrentMicrophonePipeline = useCallback(async () => {
    return createCampfireVoicePipeline({
      settings: loadCampfireMediaSettings(),
      outgoingVolume,
      monitorEnabled,
      monitorVolume,
    });
  }, [monitorEnabled, monitorVolume, outgoingVolume]);

  const verifyMicrophoneInvariant = useCallback(async (reason: string) => {
    const room = roomRef.current;
    if (!room) return;

    const expectedPublication = micPublicationRef.current;
    const before = snapshotCampfireVoicePublications(
      room.localParticipant,
      expectedPublication
    );

    const result = await enforceSingleMicrophonePublication(
      room.localParticipant,
      expectedPublication
    );

    const effectiveMuted = microphoneGateMuted();
    if (expectedPublication) {
      if (effectiveMuted && !expectedPublication.isMuted) {
        await expectedPublication.mute();
      } else if (!effectiveMuted && expectedPublication.isMuted) {
        await expectedPublication.unmute();
      }
    }

    if (result.removed > 0 || before.count > 1) {
      console.warn("Campfire voice: publicação duplicada de microfone removida.", {
        reason,
        before,
        after: result.remaining,
      });
    }

    if (result.remaining.count > 1) {
      console.error("Campfire voice: invariante de microfone ainda violada.", {
        reason,
        snapshot: result.remaining,
      });
    }
  }, [microphoneGateMuted]);


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
    const effectiveMuted = microphoneGateMuted();
    next.setMuted(effectiveMuted);

    try {
      await localTrack.replaceTrack(next.processedTrack, true);
      microphonePipelineRef.current = next;
      setRnnoiseActive(next.rnnoiseActive);
      await previous?.dispose();

      if (effectiveMuted) {
        await publication.mute();
      } else {
        await publication.unmute();
      }

      await verifyMicrophoneInvariant("device-or-profile-refresh");
      setError("");
    } catch (switchError) {
      await next.dispose();
      const message = errorMessage(switchError);
      setError(`Não foi possível trocar o microfone: ${message}`);
      throw switchError;
    }
  }, [createCurrentMicrophonePipeline, microphoneGateMuted, verifyMicrophoneInvariant]);

  const publishMicrophone = useCallback(async (room: Room) => {
    if (!permissionsRef.current.canPublishMicrophone) return;

    const settings = loadCampfireMediaSettings();
    const pipeline = await createCurrentMicrophonePipeline();
    const effectiveMuted = microphoneGateMuted();
    pipeline.setMuted(effectiveMuted);

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
      if (effectiveMuted) await publication.mute();
      await verifyMicrophoneInvariant("publishMicrophone");
    } catch (publishError) {
      await pipeline.dispose();
      throw publishError;
    }
  }, [createCurrentMicrophonePipeline, microphoneGateMuted, verifyMicrophoneInvariant]);

  const applyEffectiveMicrophoneGate = useCallback(async () => {
    const effectiveMuted = microphoneGateMuted();
    microphonePipelineRef.current?.setMuted(effectiveMuted);

    const publication = micPublicationRef.current;
    if (publication) {
      if (effectiveMuted) await publication.mute();
      else await publication.unmute();
    }

    await verifyMicrophoneInvariant("applyEffectiveMicrophoneGate");
    await publishPresence();
  }, [microphoneGateMuted, publishPresence, verifyMicrophoneInvariant]);

  const applyMute = useCallback(async (next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
    await applyEffectiveMicrophoneGate();
  }, [applyEffectiveMicrophoneGate]);

  const applyDeafenPlayback = useCallback(async (next: boolean) => {
    remoteAudioMixerRef.current?.setDeafened(next);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const next =
        (event as CustomEvent<CampfireVoiceInputSettings>).detail ??
        loadCampfireVoiceInputSettings();
      voiceInputSettingsRef.current = next;
      setVoiceInputSettings(next);
      pushToTalkHeldRef.current = false;
      setPushToTalkHeld(false);
      void applyEffectiveMicrophoneGate();
    };
    window.addEventListener(CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(CAMPFIRE_VOICE_INPUT_SETTINGS_EVENT, handler);
  }, [applyEffectiveMicrophoneGate]);

  useEffect(() => {
    if (!active) return;

    const press = (event: KeyboardEvent) => {
      const input = voiceInputSettingsRef.current;
      if (
        input.mode !== "push-to-talk" ||
        !input.binding ||
        deafenedRef.current ||
        isCampfireVoiceTypingTarget(event.target) ||
        !matchesCampfirePushToTalkBinding(event, input.binding)
      ) return;
      event.preventDefault();
      if (pushToTalkHeldRef.current) return;
      pushToTalkHeldRef.current = true;
      setPushToTalkHeld(true);
      void applyEffectiveMicrophoneGate();
    };

    const release = (event: KeyboardEvent) => {
      const input = voiceInputSettingsRef.current;
      if (
        input.mode !== "push-to-talk" ||
        !input.binding ||
        event.code !== input.binding.code ||
        !pushToTalkHeldRef.current
      ) return;
      pushToTalkHeldRef.current = false;
      setPushToTalkHeld(false);
      void applyEffectiveMicrophoneGate();
    };

    const releaseOnBlur = () => {
      if (!pushToTalkHeldRef.current) return;
      pushToTalkHeldRef.current = false;
      setPushToTalkHeld(false);
      void applyEffectiveMicrophoneGate();
    };

    window.addEventListener("keydown", press, true);
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", releaseOnBlur);
    return () => {
      window.removeEventListener("keydown", press, true);
      window.removeEventListener("keyup", release, true);
      window.removeEventListener("blur", releaseOnBlur);
    };
  }, [active, applyEffectiveMicrophoneGate]);

  const connectToCampfire = useCallback(async (targetCampfireId: string): Promise<CampfireVoiceActionResult> => {
    if (!active) return { ok: false, message: "Esta Campfire não está ativa." };
    if (joinedRef.current && connectedCampfireIdRef.current === targetCampfireId) {
      return { ok: true, message: "A voz desta Campfire já está conectada." };
    }

    setJoining(true);
    setPhase("connecting");
    setError("");
    setErrorCode(null);

    let credentials: Awaited<ReturnType<typeof requestCampfireMediaToken>>;
    try {
      credentials = await requestCampfireMediaToken({
        campfireId: targetCampfireId,
        purpose: "voice",
      });
    } catch (tokenError) {
      const message = errorMessage(tokenError);
      setErrorCode("token");
      setError(message);
      setPhase("error");
      setJoining(false);
      return { ok: false, message };
    }

    permissionsRef.current = credentials.permissions;
    connectedCampfireIdRef.current = targetCampfireId;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      stopLocalTrackOnUnpublish: true,
    });
    roomRef.current = room;
    remoteAudioMixerRef.current?.dispose();
    remoteAudioMixerRef.current = createCampfireRemoteAudioMixer();
    await remoteAudioMixerRef.current.setOutputDevice(
      loadCampfireMediaSettings().audioOutputId
    );

    room.on(RoomEvent.TrackSubscribed, upsertRemoteTrack);
    room.on(RoomEvent.TrackUnsubscribed, removeRemoteTrack);
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      applyLocalVideoPreference(principalIdFromParticipant(participant));
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      const principalId = principalIdFromParticipant(participant);
      const disconnectedTrackIds = new Set<string>();

      for (const publication of participant.trackPublications.values()) {
        const mediaTrack = publication.track?.mediaStreamTrack;
        if (mediaTrack) disconnectedTrackIds.add(mediaTrack.id);
        if (publication.source === Track.Source.Microphone) {
          remoteAudioMixerRef.current?.detach(principalId, publication.trackSid);
        }
      }

      const anotherConnectionRemains = [...room.remoteParticipants.values()]
        .some((other) => principalIdFromParticipant(other) === principalId);

      if (!anotherConnectionRemains) {
        setSpeakingParticipantIds((current) => {
          if (!current.has(principalId)) return current;
          const next = new Set(current);
          next.delete(principalId);
          return next;
        });
      }

      setRemoteStreams((current) => {
        const existing = current[principalId];
        if (!existing || !disconnectedTrackIds.size) return current;
        const remaining = existing.getTracks().filter(
          (track) => !disconnectedTrackIds.has(track.id)
        );
        const next = { ...current };
        if (remaining.length) next[principalId] = new MediaStream(remaining);
        else delete next[principalId];
        return next;
      });
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const next = new Set<string>();
      for (const participant of speakers) {
        if (participant.identity === room.localParticipant.identity) continue;
        next.add(principalIdFromParticipant(participant));
      }
      setSpeakingParticipantIds(next);
    });
    room.on(RoomEvent.Reconnecting, () => {
      setReconnecting(true);
      setPhase("reconnecting");
    });
    room.on(RoomEvent.Reconnected, () => {
      setReconnecting(false);
      setErrorCode(null);
      setError("");
      setPhase(
        micPublicationRef.current
          ? "connected-speaking"
          : "connected-listener"
      );
      void applyMute(mutedRef.current);
      void applyDeafenPlayback(deafenedRef.current);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current !== room) return;
      setJoined(false);
      joinedRef.current = false;
      setReconnecting(false);
      setPhase("disconnected");
      void publishPresence();
    });

    try {
      await room.connect(credentials.url, credentials.token);
    } catch (connectError) {
      const message = errorMessage(connectError);
      setErrorCode("network");
      setError(message);
      setPhase("error");
      await cleanupRoom();
      setJoining(false);
      return { ok: false, message };
    }

    joinedRef.current = true;
    setJoined(true);
    setPhase("connected-listener");

    for (const participant of room.remoteParticipants.values()) {
      applyLocalVideoPreference(principalIdFromParticipant(participant));
    }

    try {
      await ensurePlaybackContext();
    } catch (playbackError) {
      setErrorCode("playback-subscription");
      setError(errorMessage(playbackError));
    }

    let microphoneUnavailable = false;
    if (credentials.permissions.canPublishMicrophone) {
      try {
        setPhase("publishing-microphone");
        await publishMicrophone(room);
        setPhase("connected-speaking");
        setErrorCode(null);
        setError("");
      } catch (microphoneError) {
        const code = classifyMicrophoneError(microphoneError);
        const message = errorMessage(microphoneError);
        microphoneUnavailable = true;
        setErrorCode(code);
        setError(message);
        setPhase("microphone-unavailable");
        // Listener fallback is intentional: the LiveKit Room remains connected.
      }
    }

    if (leaseHeartbeatRef.current !== null) window.clearInterval(leaseHeartbeatRef.current);
    leaseHeartbeatRef.current = window.setInterval(() => {
      void supabase.rpc("refresh_campfire_media_lease", {
        p_campfire_id: targetCampfireId,
        p_purpose: "voice",
        p_connection_id: mediaConnectionId,
      });
    }, 60_000);

    await applyMute(mutedRef.current);
    await applyDeafenPlayback(deafenedRef.current);
    await publishPresence();
    setJoining(false);

    if (microphoneUnavailable) {
      return { ok: true, message: "Conectado à voz em modo de escuta; microfone indisponível." };
    }
    return {
      ok: true,
      message: credentials.permissions.canPublishMicrophone
        ? "Conectado automaticamente à voz da Campfire."
        : "Conectado em modo de escuta; seu microfone está bloqueado pelo owner.",
    };
  }, [
    active,
    applyDeafenPlayback,
    applyLocalVideoPreference,
    applyMute,
    cleanupRoom,
    ensurePlaybackContext,
    mediaConnectionId,
    publishMicrophone,
    publishPresence,
    removeRemoteTrack,
    upsertRemoteTrack,
  ]);

  const joinVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!campfireId) return { ok: false, message: "Nenhuma Campfire ativa." };
    return connectToCampfire(campfireId);
  }, [campfireId, connectToCampfire]);

  const leaveVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    await disconnect();
    return { ok: true, message: "Voz desconectada com a saída da Campfire." };
  }, [disconnect]);

  const toggleMute = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!joinedRef.current) return { ok: false, message: "Entre na voz primeiro." };
    if (!permissionsRef.current.canPublishMicrophone) return { ok: false, message: "Seu microfone está bloqueado pelo owner." };
    if (deafenedRef.current && mutedRef.current) {
      return { ok: false, message: "Reative o áudio antes de desmutar o microfone." };
    }
    const next = !mutedRef.current;
    await applyMute(next);
    await verifyMicrophoneInvariant("toggleMute");
    return { ok: true, message: next ? "Microfone silenciado." : "Microfone ativado." };
  }, [applyMute, verifyMicrophoneInvariant]);

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
      preDeafenMutedRef.current = mutedRef.current;
      await applyMute(true);
    }

    deafenedRef.current = next;
    setDeafened(next);
    await applyDeafenPlayback(next);

    if (!next) {
      await applyMute(preDeafenMutedRef.current);
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
    remoteAudioMixerRef.current?.setVolume(userId, nextValue);
  }, []);
  const getUserVolume = useCallback((userId: string) => userVolumesRef.current[userId] ?? 100, []);
  const setParticipantVolume = useCallback((participantId: string, percent: number) => {
    setUserVolume(participantId, percent);
  }, [setUserVolume]);
  const setParticipantLocallyMuted = useCallback((participantId: string, locallyMuted: boolean) => {
    setParticipantLocalMutes((current) => ({
      ...current,
      [participantId]: locallyMuted,
    }));
    remoteAudioMixerRef.current?.setLocallyMuted(participantId, locallyMuted);
  }, []);
  const isParticipantLocallyMuted = useCallback(
    (participantId: string) => participantLocalMutes[participantId] === true,
    [participantLocalMutes]
  );
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

  const setInputDevice = useCallback(async (deviceId: string): Promise<void> => {
    const previousSettings = loadCampfireMediaSettings();
    if (previousSettings.audioInputId === deviceId) return;

    mediaRefreshSuppressedRef.current = true;
    try {
      saveCampfireMediaSettings({
        ...previousSettings,
        audioInputId: deviceId,
      });
    } finally {
      mediaRefreshSuppressedRef.current = false;
    }

    if (!joinedRef.current || !micPublicationRef.current) return;

    try {
      await refreshPublishedMicrophone();
    } catch (switchError) {
      mediaRefreshSuppressedRef.current = true;
      try {
        saveCampfireMediaSettings(previousSettings);
      } finally {
        mediaRefreshSuppressedRef.current = false;
      }
      throw switchError;
    }
  }, [refreshPublishedMicrophone]);

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

  useEffect(() => {
    if (!active || !campfireId) {
      void disconnect();
      return;
    }

    let cancelled = false;
    void (async () => {
      await disconnect();
      if (cancelled) return;
      await connectToCampfire(campfireId);
      if (cancelled) await disconnect();
    })();

    return () => {
      cancelled = true;
    };
  // Voice membership follows Campfire membership only. Media setting changes are
  // handled in-place and must never tear down/rejoin the room.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, campfireId, currentUserId]);

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
        !mediaRefreshSuppressedRef.current &&
        (previous.audioInputId !== next.audioInputId ||
          previous.voiceProfile !== next.voiceProfile ||
          previous.echoCancellation !== next.echoCancellation ||
          previous.nativeNoiseSuppression !== next.nativeNoiseSuppression ||
          previous.autoGainControl !== next.autoGainControl ||
          previous.gateMode !== next.gateMode ||
          previous.gateSensitivity !== next.gateSensitivity)
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

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  const voiceMembers = useMemo(
    () => Object.values(presence).filter((member) => member.voiceJoined),
    [presence]
  );

  return {
    status, personalMessage, presence, signalingReady,
    joined, joining, muted, deafened, cameraEnabled, hasCamera, hasMicrophone, error,
    phase, errorCode, errorMessage: error, reconnecting,
    remoteStreams, localCameraStream: cameraStreamRef.current, voiceMembers,
    speakingParticipantIds, participantLocalMutes,
    outgoingVolume, monitorEnabled, monitorVolume,
    voiceProfile, rnnoiseActive, inputLevel, processedLevel,
    voiceInputMode: voiceInputSettings.mode,
    pushToTalkBinding: voiceInputSettings.binding,
    pushToTalkHeld,
    audioProfile: voiceProfile === "studio" ? "studio" : "voice",
    setStatus, setPersonalMessage, detectDevices,
    joinVoice, leaveVoice, disconnect, toggleMute, toggleCamera, toggleDeafen,
    getUserVolume, setUserVolume, setParticipantVolume,
    setParticipantLocallyMuted, isParticipantLocallyMuted, setInputDevice,
    setOutgoingVolume,
    setMonitorEnabled: setMonitorEnabledState, setMonitorVolume,
    setVoiceProfile, setAudioProfile,
  };
}
