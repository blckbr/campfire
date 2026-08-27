import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  RealtimeChannel,
} from "@supabase/supabase-js";

import {
  supabase,
} from "./lib/supabase";

import {
  CAMPFIRE_MEDIA_SETTINGS_EVENT,
  audioInputConstraint,
  loadCampfireMediaSettings,
  saveCampfireMediaSettings,
  videoInputConstraint,
  type CampfireAudioProfile,
} from "./campfireMediaSettings";

export type CampfirePresenceStatus =
  | "online"
  | "away"
  | "busy"
  | "offline";

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

export type CampfireVoiceActionResult = {
  ok: boolean;
  message: string;
};

type VoiceSignal =
  | {
      kind: "offer";
      fromId: string;
      toId: string;
      description: RTCSessionDescriptionInit;
    }
  | {
      kind: "answer";
      fromId: string;
      toId: string;
      description: RTCSessionDescriptionInit;
    }
  | {
      kind: "ice";
      fromId: string;
      toId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      kind: "voice-leave";
      fromId: string;
    };

type PresencePayload = {
  userId?: unknown;
  status?: unknown;
  personalMessage?: unknown;
  hasCamera?: unknown;
  hasMicrophone?: unknown;
  voiceJoined?: unknown;
  cameraEnabled?: unknown;
  micEnabled?: unknown;
  updatedAt?: unknown;
};

type PlaybackNode = {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
};

type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.cloudflare.com:3478",
    },
  ],
  iceCandidatePoolSize: 4,
};

const STATUS_MESSAGE_KEY =
  "campfire.presence.personalMessage";

const USER_VOLUME_KEY =
  "campfire.voice.userVolumes.v1";

const OUTGOING_VOLUME_KEY =
  "campfire.voice.outgoingVolume.v1";

const MONITOR_VOLUME_KEY =
  "campfire.voice.monitorVolume.v1";

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(
    0,
    Math.min(200, Math.round(value))
  );
}

function loadNumber(
  key: string,
  fallback: number
): number {
  try {
    const value = Number(
      localStorage.getItem(key)
    );

    return Number.isFinite(value)
      ? clampVolume(value)
      : fallback;
  } catch {
    return fallback;
  }
}

function loadUserVolumes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(
      USER_VOLUME_KEY
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const next: Record<string, number> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") {
        next[key] = clampVolume(value);
      }
    }

    return next;
  } catch {
    return {};
  }
}

function normalizeStatus(
  value: unknown
): CampfirePresenceStatus {
  if (
    value === "away" ||
    value === "busy" ||
    value === "offline"
  ) {
    return value;
  }

  return "online";
}

function normalizePresence(
  raw: PresencePayload,
  fallbackUserId: string
): CampfirePresenceMember {
  return {
    userId:
      typeof raw.userId === "string"
        ? raw.userId
        : fallbackUserId,

    status: normalizeStatus(raw.status),

    personalMessage:
      typeof raw.personalMessage === "string"
        ? raw.personalMessage.slice(0, 120)
        : "",

    hasCamera: raw.hasCamera === true,
    hasMicrophone: raw.hasMicrophone === true,
    voiceJoined: raw.voiceJoined === true,
    cameraEnabled: raw.cameraEnabled === true,
    micEnabled: raw.micEnabled !== false,

    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function isVoiceSignal(
  value: unknown
): value is VoiceSignal {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value)
  ) {
    return false;
  }

  const kind = String(
    (value as { kind?: unknown }).kind ?? ""
  );

  return (
    kind === "offer" ||
    kind === "answer" ||
    kind === "ice" ||
    kind === "voice-leave"
  );
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message?: unknown }).message ??
        "Não foi possível concluir a operação."
    );
  }

  return "Não foi possível concluir a operação.";
}

export type CampfireVoiceController = ReturnType<
  typeof useCampfireVoice
>;

export function useCampfireVoice(
  campfireId: string,
  currentUserId: string,
  initialStatus: string,
  active = true
) {
  const [status, setStatusState] =
    useState<CampfirePresenceStatus>(
      normalizeStatus(initialStatus)
    );

  const [personalMessage, setPersonalMessageState] =
    useState(() => {
      try {
        return (
          localStorage.getItem(
            `${STATUS_MESSAGE_KEY}.${currentUserId}`
          ) ?? ""
        ).slice(0, 120);
      } catch {
        return "";
      }
    });

  const [presence, setPresence] = useState<
    Record<string, CampfirePresenceMember>
  >({});

  const [signalingReady, setSignalingReady] =
    useState(false);

  const [joined, setJoinedState] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] =
    useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMicrophone, setHasMicrophone] =
    useState(false);
  const [error, setError] = useState("");

  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});

  const [userVolumes, setUserVolumes] = useState<
    Record<string, number>
  >(loadUserVolumes);

  const [outgoingVolume, setOutgoingVolumeState] =
    useState(() =>
      loadNumber(OUTGOING_VOLUME_KEY, 100)
    );

  const [monitorEnabled, setMonitorEnabled] =
    useState(false);

  const [monitorVolume, setMonitorVolumeState] =
    useState(() =>
      loadNumber(MONITOR_VOLUME_KEY, 100)
    );

  const [audioProfile, setAudioProfileState] =
    useState<CampfireAudioProfile>(() =>
      loadCampfireMediaSettings().audioProfile
    );

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  const joinedRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const cameraEnabledRef = useRef(false);
  const statusRef = useRef(status);
  const personalMessageRef = useRef(personalMessage);
  const hasCameraRef = useRef(false);
  const hasMicrophoneRef = useRef(false);

  const peersRef = useRef(
    new Map<string, RTCPeerConnection>()
  );

  const iceQueueRef = useRef(
    new Map<string, RTCIceCandidateInit[]>()
  );

  const rawMicStreamRef = useRef<MediaStream | null>(
    null
  );

  const outgoingStreamRef = useRef<MediaStream | null>(
    null
  );

  const cameraStreamRef = useRef<MediaStream | null>(
    null
  );

  const captureAudioContextRef =
    useRef<AudioContext | null>(null);
  const outgoingGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);

  const playbackAudioContextRef =
    useRef<AudioContext | null>(null);

  const playbackNodesRef = useRef(
    new Map<string, PlaybackNode>()
  );

  const userVolumesRef = useRef(userVolumes);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    personalMessageRef.current = personalMessage;
  }, [personalMessage]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    hasCameraRef.current = hasCamera;
  }, [hasCamera]);

  useEffect(() => {
    hasMicrophoneRef.current = hasMicrophone;
  }, [hasMicrophone]);

  useEffect(() => {
    userVolumesRef.current = userVolumes;
  }, [userVolumes]);

  const publishPresence = useCallback(async () => {
    if (!active) {
      return;
    }

    const channel = channelRef.current;

    if (!channel || !subscribedRef.current) {
      return;
    }

    try {
      /*
       * "Offline" funciona como o antigo "Aparecer offline":
       * fora da voz o cliente deixa de publicar presença. Ao entrar
       * numa chamada ele volta a publicar porque precisa aparecer
       * para os participantes daquela chamada.
       */
      if (
        statusRef.current === "offline" &&
        !joinedRef.current
      ) {
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
          joinedRef.current && !mutedRef.current,
        updatedAt: new Date().toISOString(),
      });
    } catch (trackError) {
      console.warn(
        "Falha publicando presença Campfire:",
        trackError
      );
    }
  }, [active, currentUserId]);

  const detectDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setHasCamera(false);
      setHasMicrophone(false);
      return;
    }

    try {
      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const nextCamera = devices.some(
        (device) => device.kind === "videoinput"
      );

      const nextMicrophone = devices.some(
        (device) => device.kind === "audioinput"
      );

      setHasCamera(nextCamera);
      setHasMicrophone(nextMicrophone);
      hasCameraRef.current = nextCamera;
      hasMicrophoneRef.current = nextMicrophone;

      await publishPresence();
    } catch (deviceError) {
      console.warn(
        "Não foi possível enumerar dispositivos:",
        deviceError
      );
    }
  }, [publishPresence]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void detectDevices();

    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void detectDevices();
    };

    mediaDevices.addEventListener(
      "devicechange",
      handleDeviceChange
    );

    return () => {
      mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, [active, detectDevices]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    async function loadProfilePresence() {
      try {
        const { data, error: profileError } =
          await supabase
            .from("profiles")
            .select("status,status_message")
            .eq("id", currentUserId)
            .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (cancelled || !data) {
          return;
        }

        const nextStatus = normalizeStatus(
          (data as { status?: unknown }).status
        );

        const nextMessage =
          typeof (
            data as { status_message?: unknown }
          ).status_message === "string"
            ? String(
                (
                  data as {
                    status_message?: unknown;
                  }
                ).status_message
              ).slice(0, 120)
            : personalMessageRef.current;

        setStatusState(nextStatus);
        statusRef.current = nextStatus;
        setPersonalMessageState(nextMessage);
        personalMessageRef.current = nextMessage;

        window.dispatchEvent(
          new CustomEvent(
            "campfire-profile-presence-change",
            {
              detail: {
                status: nextStatus,
                personalMessage: nextMessage,
              },
            }
          )
        );
      } catch {
        /*
         * A coluna status_message só existe depois do upgrade SQL.
         * O Campfire continua funcionando com o estado local enquanto
         * o usuário ainda não executou o script.
         */
      }
    }

    void loadProfilePresence();

    return () => {
      cancelled = true;
    };
  }, [active, currentUserId]);

  const closePlaybackForUser = useCallback(
    (userId: string) => {
      const node = playbackNodesRef.current.get(userId);

      if (node) {
        try {
          node.source.disconnect();
          node.gain.disconnect();
        } catch {
          // best effort
        }

        playbackNodesRef.current.delete(userId);
      }
    },
    []
  );

  const closePeer = useCallback(
    (userId: string) => {
      const peer = peersRef.current.get(userId);

      if (peer) {
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
        peersRef.current.delete(userId);
      }

      iceQueueRef.current.delete(userId);
      closePlaybackForUser(userId);

      setRemoteStreams((current) => {
        if (!(userId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[userId];
        return next;
      });
    },
    [closePlaybackForUser]
  );

  const ensurePlaybackContext = useCallback(async () => {
    let context = playbackAudioContextRef.current;

    if (!context) {
      context = new AudioContext();
      playbackAudioContextRef.current = context;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // user gesture may be required; joinVoice is a user gesture.
      }
    }

    const outputId =
      loadCampfireMediaSettings().audioOutputId;

    const sinkContext =
      context as SinkAudioContext;

    if (
      outputId &&
      typeof sinkContext.setSinkId === "function"
    ) {
      try {
        await sinkContext.setSinkId(outputId);
      } catch (sinkError) {
        console.warn(
          "Não foi possível trocar a saída de áudio:",
          sinkError
        );
      }
    }

    return context;
  }, []);

  useEffect(() => {
    function handleMediaSettingsChange() {
      if (playbackAudioContextRef.current) {
        void ensurePlaybackContext();
      }

      void detectDevices();
    }

    window.addEventListener(
      CAMPFIRE_MEDIA_SETTINGS_EVENT,
      handleMediaSettingsChange
    );

    return () => {
      window.removeEventListener(
        CAMPFIRE_MEDIA_SETTINGS_EVENT,
        handleMediaSettingsChange
      );
    };
  }, [detectDevices, ensurePlaybackContext]);

  const attachRemotePlayback = useCallback(
    async (userId: string, stream: MediaStream) => {
      closePlaybackForUser(userId);

      if (stream.getAudioTracks().length === 0) {
        return;
      }

      try {
        const context = await ensurePlaybackContext();
        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain();
        const configuredVolume =
          userVolumesRef.current[userId] ?? 100;

        gain.gain.value = deafenedRef.current
          ? 0
          : configuredVolume / 100;

        source.connect(gain);
        gain.connect(context.destination);

        playbackNodesRef.current.set(userId, {
          source,
          gain,
        });
      } catch (playbackError) {
        console.error(
          "Erro preparando áudio remoto:",
          playbackError
        );
      }
    },
    [closePlaybackForUser, ensurePlaybackContext]
  );

  const sendSignal = useCallback(
    async (signal: VoiceSignal) => {
      const channel = channelRef.current;

      if (!channel || !subscribedRef.current) {
        throw new Error(
          "O canal de voz ainda não está conectado."
        );
      }

      const result = await channel.send({
        type: "broadcast",
        event: "voice-signal",
        payload: signal,
      });

      if (result !== "ok") {
        throw new Error(
          `Falha na sinalização de voz: ${result}`
        );
      }
    },
    []
  );

  const flushIceQueue = useCallback(
    async (
      userId: string,
      peer: RTCPeerConnection
    ) => {
      const queue =
        iceQueueRef.current.get(userId) ?? [];

      iceQueueRef.current.delete(userId);

      for (const candidate of queue) {
        try {
          await peer.addIceCandidate(candidate);
        } catch (iceError) {
          console.warn(
            "ICE remoto rejeitado:",
            iceError
          );
        }
      }
    },
    []
  );

  const createPeer = useCallback(
    (remoteUserId: string) => {
      const existing = peersRef.current.get(remoteUserId);

      if (existing) {
        return existing;
      }

      const peer = new RTCPeerConnection(
        RTC_CONFIGURATION
      );

      peersRef.current.set(remoteUserId, peer);

      const outgoingStream = outgoingStreamRef.current;

      if (outgoingStream) {
        for (const track of outgoingStream.getTracks()) {
          peer.addTrack(track, outgoingStream);
        }
      }

      const cameraStream = cameraStreamRef.current;

      if (cameraStream) {
        for (const track of cameraStream.getVideoTracks()) {
          peer.addTrack(track, cameraStream);
        }
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        void sendSignal({
          kind: "ice",
          fromId: currentUserId,
          toId: remoteUserId,
          candidate: event.candidate.toJSON(),
        }).catch((signalError) => {
          console.warn(
            "Falha enviando ICE de voz:",
            signalError
          );
        });
      };

      peer.ontrack = (event) => {
        const firstStream = event.streams[0];

        setRemoteStreams((current) => {
          let stream = firstStream ?? current[remoteUserId];

          if (!stream) {
            stream = new MediaStream();
          }

          if (
            !stream
              .getTracks()
              .some((track) => track.id === event.track.id)
          ) {
            stream.addTrack(event.track);
          }

          void attachRemotePlayback(
            remoteUserId,
            stream
          );

          return {
            ...current,
            [remoteUserId]: stream,
          };
        });
      };

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "closed"
        ) {
          closePeer(remoteUserId);
        }
      };

      return peer;
    },
    [
      attachRemotePlayback,
      closePeer,
      currentUserId,
      sendSignal,
    ]
  );

  const makeOffer = useCallback(
    async (remoteUserId: string) => {
      if (!joinedRef.current) {
        return;
      }

      const peer = createPeer(remoteUserId);

      if (peer.signalingState !== "stable") {
        return;
      }

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (!peer.localDescription) {
        return;
      }

      await sendSignal({
        kind: "offer",
        fromId: currentUserId,
        toId: remoteUserId,
        description: {
          type: peer.localDescription.type,
          sdp: peer.localDescription.sdp,
        },
      });
    },
    [createPeer, currentUserId, sendSignal]
  );

  const synchronizePeers = useCallback(
    (nextPresence: Record<string, CampfirePresenceMember>) => {
      const activeVoiceIds = new Set(
        Object.values(nextPresence)
          .filter(
            (member) =>
              member.voiceJoined &&
              member.userId !== currentUserId
          )
          .map((member) => member.userId)
      );

      for (const userId of peersRef.current.keys()) {
        if (!activeVoiceIds.has(userId)) {
          closePeer(userId);
        }
      }

      if (!joinedRef.current) {
        return;
      }

      for (const userId of activeVoiceIds) {
        if (peersRef.current.has(userId)) {
          continue;
        }

        /*
         * O menor UUID inicia a primeira oferta. Isso evita que os
         * dois lados criem a oferta inicial ao mesmo tempo.
         */
        if (currentUserId.localeCompare(userId) < 0) {
          void makeOffer(userId).catch((offerError) => {
            console.error(
              "Erro iniciando conexão de voz:",
              offerError
            );
          });
        }
      }
    },
    [closePeer, currentUserId, makeOffer]
  );

  const readPresenceState = useCallback(() => {
    const channel = channelRef.current;

    if (!channel) {
      return;
    }

    const rawState = channel.presenceState() as Record<
      string,
      PresencePayload[]
    >;

    const next: Record<string, CampfirePresenceMember> = {};

    for (const [key, entries] of Object.entries(rawState)) {
      const latest = entries[entries.length - 1];

      if (!latest) {
        continue;
      }

      const normalized = normalizePresence(latest, key);
      next[normalized.userId] = normalized;
    }

    setPresence(next);
    synchronizePeers(next);
  }, [synchronizePeers]);

  useEffect(() => {
    if (!active) {
      subscribedRef.current = false;
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
         * React StrictMode monta/desmonta efeitos duas vezes em dev.
         * Retiramos qualquer instância antiga deste MESMO tópico antes
         * de registrar callbacks no canal novo.
         */
        const existingChannels = supabase
          .getChannels()
          .filter((item) =>
            String(item.topic).endsWith(topic)
          );

        for (const existing of existingChannels) {
          try {
            await existing.unsubscribe();
          } catch {
            // best effort
          }
        }

        if (disposed) {
          return;
        }

        channel = supabase.channel(topic, {
          config: {
            private: true,
            broadcast: {
              self: false,
            },
            presence: {
              key: currentUserId,
            },
          },
        });

        channelRef.current = channel;

        channel.on(
          "presence",
          { event: "sync" },
          readPresenceState
        );

        channel.on(
          "presence",
          { event: "join" },
          readPresenceState
        );

        channel.on(
          "presence",
          { event: "leave" },
          readPresenceState
        );

        channel.on(
          "broadcast",
          { event: "voice-signal" },
          async (message) => {
            const signal = message.payload as unknown;

            if (!isVoiceSignal(signal)) {
              return;
            }

            if (
              signal.kind === "voice-leave"
            ) {
              if (signal.fromId !== currentUserId) {
                closePeer(signal.fromId);
              }

              return;
            }

            if (signal.toId !== currentUserId) {
              return;
            }

            try {
              if (signal.kind === "offer") {
                if (!joinedRef.current) {
                  return;
                }

                const peer = createPeer(signal.fromId);

                await peer.setRemoteDescription(
                  signal.description
                );

                await flushIceQueue(
                  signal.fromId,
                  peer
                );

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                if (!peer.localDescription) {
                  return;
                }

                await sendSignal({
                  kind: "answer",
                  fromId: currentUserId,
                  toId: signal.fromId,
                  description: {
                    type: peer.localDescription.type,
                    sdp: peer.localDescription.sdp,
                  },
                });

                return;
              }

              if (signal.kind === "answer") {
                const peer = peersRef.current.get(
                  signal.fromId
                );

                if (!peer) {
                  return;
                }

                await peer.setRemoteDescription(
                  signal.description
                );

                await flushIceQueue(
                  signal.fromId,
                  peer
                );

                return;
              }

              if (signal.kind === "ice") {
                const peer = peersRef.current.get(
                  signal.fromId
                );

                if (
                  peer &&
                  peer.remoteDescription
                ) {
                  await peer.addIceCandidate(
                    signal.candidate
                  );
                } else {
                  const queue =
                    iceQueueRef.current.get(
                      signal.fromId
                    ) ?? [];

                  queue.push(signal.candidate);
                  iceQueueRef.current.set(
                    signal.fromId,
                    queue
                  );
                }
              }
            } catch (signalError) {
              console.error(
                "Erro processando sinal de voz:",
                signalError
              );
            }
          }
        );

        channel.subscribe(async (channelStatus, channelError) => {
          if (disposed) {
            return;
          }

          if (channelStatus === "SUBSCRIBED") {
            subscribedRef.current = true;
            setSignalingReady(true);
            setError("");
            await publishPresence();
            return;
          }

          if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT"
          ) {
            subscribedRef.current = false;
            setSignalingReady(false);
            setError(
              channelError?.message ||
                "Não foi possível conectar a presença/voz da Campfire. Execute o upgrade SQL se ainda não o fez."
            );
          }

          if (channelStatus === "CLOSED") {
            subscribedRef.current = false;
            setSignalingReady(false);
          }
        });
      } catch (channelError) {
        if (!disposed) {
          setSignalingReady(false);
          setError(errorMessage(channelError));
        }
      }
    }

    void initializeChannel();

    return () => {
      disposed = true;
      subscribedRef.current = false;
      setSignalingReady(false);

      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      if (channel) {
        void channel.untrack().catch(() => undefined);
        void channel.unsubscribe().catch(() => undefined);
      }
    };
  }, [
    active,
    campfireId,
    closePeer,
    createPeer,
    currentUserId,
    flushIceQueue,
    publishPresence,
    readPresenceState,
    sendSignal,
  ]);

  useEffect(() => {
    void publishPresence();
  }, [
    cameraEnabled,
    hasCamera,
    hasMicrophone,
    joined,
    muted,
    personalMessage,
    publishPresence,
    status,
  ]);

  const setStatus = useCallback(
    async (nextStatus: CampfirePresenceStatus) => {
      setStatusState(nextStatus);
      statusRef.current = nextStatus;

      window.dispatchEvent(
        new CustomEvent(
          "campfire-profile-presence-change",
          {
            detail: {
              status: nextStatus,
              personalMessage:
                personalMessageRef.current,
            },
          }
        )
      );

      try {
        await supabase
          .from("profiles")
          .update({ status: nextStatus })
          .eq("id", currentUserId);
      } catch {
        // presence live still works
      }

      await publishPresence();
    },
    [currentUserId, publishPresence]
  );

  const setPersonalMessage = useCallback(
    async (value: string) => {
      const next = value.slice(0, 120);

      setPersonalMessageState(next);
      personalMessageRef.current = next;

      window.dispatchEvent(
        new CustomEvent(
          "campfire-profile-presence-change",
          {
            detail: {
              status: statusRef.current,
              personalMessage: next,
            },
          }
        )
      );

      try {
        localStorage.setItem(
          `${STATUS_MESSAGE_KEY}.${currentUserId}`,
          next
        );
      } catch {
        // optional persistence
      }

      try {
        await supabase
          .from("profiles")
          .update({ status_message: next })
          .eq("id", currentUserId);
      } catch {
        // column may not exist until upgrade SQL
      }

      await publishPresence();
    },
    [currentUserId, publishPresence]
  );

  const closeCaptureAudio = useCallback(async () => {
    const context = captureAudioContextRef.current;
    captureAudioContextRef.current = null;
    outgoingGainRef.current = null;
    monitorGainRef.current = null;

    if (context) {
      try {
        await context.close();
      } catch {
        // best effort
      }
    }
  }, []);

  const leaveVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!joinedRef.current && !joining) {
      return {
        ok: true,
        message: "Você já está fora da voz.",
      };
    }

    joinedRef.current = false;
    setJoinedState(false);
    setJoining(false);
    setMuted(false);
    mutedRef.current = false;
    setCameraEnabled(false);
    cameraEnabledRef.current = false;

    try {
      if (subscribedRef.current) {
        await sendSignal({
          kind: "voice-leave",
          fromId: currentUserId,
        });
      }
    } catch {
      // best effort
    }

    for (const userId of Array.from(peersRef.current.keys())) {
      closePeer(userId);
    }

    rawMicStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());
    rawMicStreamRef.current = null;

    outgoingStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());
    outgoingStreamRef.current = null;

    cameraStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());
    cameraStreamRef.current = null;

    await closeCaptureAudio();
    setRemoteStreams({});
    await publishPresence();

    return {
      ok: true,
      message: "Você saiu da voz.",
    };
  }, [
    closeCaptureAudio,
    closePeer,
    currentUserId,
    joining,
    publishPresence,
    sendSignal,
  ]);

  const joinVoice = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!active) {
      return {
        ok: false,
        message: "Entre na Campfire antes de entrar na voz.",
      };
    }

    if (joinedRef.current) {
      return {
        ok: true,
        message: "Você já está na voz.",
      };
    }

    if (joining) {
      return {
        ok: false,
        message: "Aguarde a conexão atual.",
      };
    }

    if (!signalingReady) {
      return {
        ok: false,
        message: "O canal de voz ainda está conectando.",
      };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        ok: false,
        message: "Este sistema não disponibilizou acesso ao microfone.",
      };
    }

    setJoining(true);
    setError("");

    try {
      const mediaSettings =
        loadCampfireMediaSettings();

      const rawStream =
        await navigator.mediaDevices.getUserMedia({
          audio: audioInputConstraint(
            mediaSettings.audioInputId
          ),
          video: false,
        });

      rawMicStreamRef.current = rawStream;
      setHasMicrophone(true);
      hasMicrophoneRef.current = true;

      const context = new AudioContext();
      captureAudioContextRef.current = context;
      await context.resume().catch(() => undefined);

      const source = context.createMediaStreamSource(
        rawStream
      );
      const outgoingGain = context.createGain();
      const monitorGain = context.createGain();
      const destination =
        context.createMediaStreamDestination();

      outgoingGain.gain.value =
        outgoingVolume / 100;

      monitorGain.gain.value = monitorEnabled
        ? monitorVolume / 100
        : 0;

      source.connect(outgoingGain);
      outgoingGain.connect(destination);
      source.connect(monitorGain);
      monitorGain.connect(context.destination);

      outgoingGainRef.current = outgoingGain;
      monitorGainRef.current = monitorGain;
      outgoingStreamRef.current = destination.stream;

      joinedRef.current = true;
      setJoinedState(true);
      mutedRef.current = false;
      setMuted(false);
      setJoining(false);

      await ensurePlaybackContext();
      await detectDevices();
      await publishPresence();

      const currentPresence = presence;
      synchronizePeers(currentPresence);

      return {
        ok: true,
        message: "Você entrou na voz.",
      };
    } catch (joinError) {
      setJoining(false);
      joinedRef.current = false;
      setJoinedState(false);

      rawMicStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
      rawMicStreamRef.current = null;

      await closeCaptureAudio();

      const message =
        joinError instanceof DOMException &&
        joinError.name === "NotAllowedError"
          ? "Permissão de microfone negada."
          : errorMessage(joinError);

      setError(message);

      return {
        ok: false,
        message,
      };
    }
  }, [
    active,
    closeCaptureAudio,
    detectDevices,
    ensurePlaybackContext,
    joining,
    monitorEnabled,
    monitorVolume,
    outgoingVolume,
    presence,
    publishPresence,
    signalingReady,
    synchronizePeers,
  ]);

  const setMutedState = useCallback(
    async (nextMuted: boolean) => {
      mutedRef.current = nextMuted;
      setMuted(nextMuted);

      outgoingStreamRef.current
        ?.getAudioTracks()
        .forEach((track) => {
          track.enabled = !nextMuted;
        });

      await publishPresence();
    },
    [publishPresence]
  );

  const toggleMute = useCallback(async () => {
    await setMutedState(!mutedRef.current);
  }, [setMutedState]);

  const renegotiateAll = useCallback(async () => {
    for (const userId of peersRef.current.keys()) {
      try {
        await makeOffer(userId);
      } catch (renegotiateError) {
        console.warn(
          "Renegociação de mídia falhou:",
          renegotiateError
        );
      }
    }
  }, [makeOffer]);

  const toggleCamera = useCallback(async (): Promise<CampfireVoiceActionResult> => {
    if (!joinedRef.current) {
      return {
        ok: false,
        message: "Entre na voz antes de ligar a webcam.",
      };
    }

    if (cameraEnabledRef.current) {
      const stream = cameraStreamRef.current;
      const track = stream?.getVideoTracks()[0];

      if (track) {
        for (const peer of peersRef.current.values()) {
          const sender = peer
            .getSenders()
            .find(
              (item) => item.track?.id === track.id
            );

          if (sender) {
            peer.removeTrack(sender);
          }
        }
      }

      stream
        ?.getTracks()
        .forEach((item) => item.stop());

      cameraStreamRef.current = null;
      cameraEnabledRef.current = false;
      setCameraEnabled(false);
      await publishPresence();
      await renegotiateAll();

      return {
        ok: true,
        message: "Webcam desligada.",
      };
    }

    try {
      const mediaSettings =
        loadCampfireMediaSettings();

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: videoInputConstraint(
            mediaSettings.videoInputId
          ),
          audio: false,
        });

      const track = stream.getVideoTracks()[0];

      if (!track) {
        throw new Error(
          "Nenhuma webcam foi encontrada."
        );
      }

      cameraStreamRef.current = stream;
      setHasCamera(true);
      hasCameraRef.current = true;
      cameraEnabledRef.current = true;
      setCameraEnabled(true);

      for (const peer of peersRef.current.values()) {
        peer.addTrack(track, stream);
      }

      await publishPresence();
      await renegotiateAll();

      track.addEventListener(
        "ended",
        () => {
          if (cameraEnabledRef.current) {
            void toggleCamera();
          }
        },
        { once: true }
      );

      return {
        ok: true,
        message: "Webcam ligada.",
      };
    } catch (cameraError) {
      const message =
        cameraError instanceof DOMException &&
        cameraError.name === "NotAllowedError"
          ? "Permissão de webcam negada."
          : errorMessage(cameraError);

      setError(message);

      return {
        ok: false,
        message,
      };
    }
  }, [
    publishPresence,
    renegotiateAll,
  ]);

  const setDeafenedState = useCallback(
    (nextDeafened: boolean) => {
      deafenedRef.current = nextDeafened;
      setDeafened(nextDeafened);

      for (const [userId, node] of playbackNodesRef.current) {
        const volume =
          userVolumesRef.current[userId] ?? 100;

        node.gain.gain.value = nextDeafened
          ? 0
          : volume / 100;
      }
    },
    []
  );

  const toggleDeafen = useCallback(() => {
    setDeafenedState(!deafenedRef.current);
  }, [setDeafenedState]);

  const setUserVolume = useCallback(
    (userId: string, value: number) => {
      const nextValue = clampVolume(value);

      setUserVolumes((current) => {
        const next = {
          ...current,
          [userId]: nextValue,
        };

        userVolumesRef.current = next;

        try {
          localStorage.setItem(
            USER_VOLUME_KEY,
            JSON.stringify(next)
          );
        } catch {
          // optional persistence
        }

        return next;
      });

      const node = playbackNodesRef.current.get(userId);

      if (node) {
        node.gain.gain.value = deafenedRef.current
          ? 0
          : nextValue / 100;
      }
    },
    []
  );

  const getUserVolume = useCallback(
    (userId: string) =>
      userVolumesRef.current[userId] ?? 100,
    []
  );

  const setOutgoingVolume = useCallback(
    (value: number) => {
      const next = clampVolume(value);
      setOutgoingVolumeState(next);

      try {
        localStorage.setItem(
          OUTGOING_VOLUME_KEY,
          String(next)
        );
      } catch {
        // optional persistence
      }

      if (outgoingGainRef.current) {
        outgoingGainRef.current.gain.value = next / 100;
      }
    },
    []
  );

  const setMonitorEnabledState = useCallback(
    (enabled: boolean) => {
      setMonitorEnabled(enabled);

      if (monitorGainRef.current) {
        monitorGainRef.current.gain.value = enabled
          ? monitorVolume / 100
          : 0;
      }
    },
    [monitorVolume]
  );

  const setMonitorVolume = useCallback(
    (value: number) => {
      const next = clampVolume(value);
      setMonitorVolumeState(next);

      try {
        localStorage.setItem(
          MONITOR_VOLUME_KEY,
          String(next)
        );
      } catch {
        // optional persistence
      }

      if (
        monitorGainRef.current &&
        monitorEnabled
      ) {
        monitorGainRef.current.gain.value = next / 100;
      }
    },
    [monitorEnabled]
  );

  const setAudioProfile = useCallback((profile: CampfireAudioProfile): CampfireVoiceActionResult => {
    const next = profile === "studio" ? "studio" : "voice";
    saveCampfireMediaSettings({ ...loadCampfireMediaSettings(), audioProfile: next });
    setAudioProfileState(next);
    return {
      ok: true,
      message: "Modo de áudio salvo. O transporte P2P legado não oferece o preset Hi-Fi do LiveKit.",
    };
  }, []);

  const voiceMembers = useMemo(
    () =>
      (Object.values(presence) as CampfirePresenceMember[]).filter(
        (member) => member.voiceJoined
      ),
    [presence]
  );

  useEffect(() => {
    return () => {
      joinedRef.current = false;

      for (const peer of peersRef.current.values()) {
        peer.close();
      }
      peersRef.current.clear();

      rawMicStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
      outgoingStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
      cameraStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      for (const node of playbackNodesRef.current.values()) {
        try {
          node.source.disconnect();
          node.gain.disconnect();
        } catch {
          // best effort
        }
      }
      playbackNodesRef.current.clear();

      void captureAudioContextRef.current
        ?.close()
        .catch(() => undefined);
      void playbackAudioContextRef.current
        ?.close()
        .catch(() => undefined);
    };
  }, []);

  return {
    status,
    personalMessage,
    presence,
    signalingReady,

    joined,
    joining,
    muted,
    deafened,
    cameraEnabled,
    hasCamera,
    hasMicrophone,
    error,
    reconnecting: false,

    remoteStreams,
    localCameraStream:
      cameraStreamRef.current,
    voiceMembers,

    outgoingVolume,
    monitorEnabled,
    monitorVolume,
    audioProfile,

    setStatus,
    setPersonalMessage,
    detectDevices,

    joinVoice,
    leaveVoice,
    toggleMute,
    toggleCamera,
    toggleDeafen,

    getUserVolume,
    setUserVolume,
    setOutgoingVolume,
    setMonitorEnabled: setMonitorEnabledState,
    setMonitorVolume,
    setAudioProfile,
  };
}
