type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type RemoteAudioChain = {
  participantId: string;
  trackSid: string;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  limiter: DynamicsCompressorNode;
};

type ParticipantMixState = {
  volume: number;
  locallyMuted: boolean;
};

export type CampfireRemoteAudioMixer = {
  attach(participantId: string, trackSid: string, mediaStreamTrack: MediaStreamTrack): void;
  detach(participantId: string, trackSid: string): void;
  detachParticipant(participantId: string): void;
  setVolume(participantId: string, percent: number): void;
  setLocallyMuted(participantId: string, muted: boolean): void;
  isLocallyMuted(participantId: string): boolean;
  setDeafened(deafened: boolean): void;
  setOutputDevice(deviceId: string): Promise<void>;
  dispose(): void;
};

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.max(0, Math.min(200, Math.round(percent)));
}

function gainForPercent(percent: number): number {
  const value = Math.max(0, Math.min(200, percent));
  if (value <= 100) return value / 100;
  const t = (value - 100) / 100;
  return 1 + (3 * t); // 100%=1x, 200%=4x
}

export function createCampfireRemoteAudioMixer(): CampfireRemoteAudioMixer {
  const chains = new Map<string, RemoteAudioChain>();
  const participantState = new Map<string, ParticipantMixState>();
  let context: SinkAudioContext | null = null;
  let deafened = false;
  let outputDeviceId = "";
  let disposed = false;

  function ensureContext(): SinkAudioContext {
    if (disposed) throw new Error("Campfire remote audio mixer was disposed.");
    if (!context) {
      context = new AudioContext() as SinkAudioContext;
      if (outputDeviceId && typeof context.setSinkId === "function") {
        void context.setSinkId(outputDeviceId).catch(() => undefined);
      }
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    return context;
  }

  function getState(participantId: string): ParticipantMixState {
    return participantState.get(participantId) ?? {
      volume: 100,
      locallyMuted: false,
    };
  }

  function updateParticipantGain(participantId: string): void {
    const state = getState(participantId);
    const gain = deafened || state.locallyMuted
      ? 0
      : gainForPercent(state.volume);
    for (const chain of chains.values()) {
      if (chain.participantId === participantId) {
        chain.gain.gain.value = gain;
      }
    }
  }

  function attach(
    participantId: string,
    trackSid: string,
    mediaStreamTrack: MediaStreamTrack,
  ): void {
    const key = `${participantId}:${trackSid}`;
    if (chains.has(key)) return;

    const audioContext = ensureContext();
    const stream = new MediaStream([mediaStreamTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    const gain = audioContext.createGain();
    const limiter = audioContext.createDynamicsCompressor();

    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(audioContext.destination);

    chains.set(key, {
      participantId,
      trackSid,
      source,
      gain,
      limiter,
    });
    updateParticipantGain(participantId);
  }

  function detach(participantId: string, trackSid: string): void {
    const key = `${participantId}:${trackSid}`;
    const chain = chains.get(key);
    if (!chain) return;
    chains.delete(key);
    try {
      chain.source.disconnect();
      chain.gain.disconnect();
      chain.limiter.disconnect();
    } catch {
      // The track may already have ended/disconnected.
    }
  }

  function detachParticipant(participantId: string): void {
    for (const chain of [...chains.values()]) {
      if (chain.participantId === participantId) {
        detach(chain.participantId, chain.trackSid);
      }
    }
  }

  function setVolume(participantId: string, percent: number): void {
    const state = getState(participantId);
    participantState.set(participantId, {
      ...state,
      volume: clampPercent(percent),
    });
    updateParticipantGain(participantId);
  }

  function setLocallyMuted(participantId: string, muted: boolean): void {
    const state = getState(participantId);
    participantState.set(participantId, {
      ...state,
      locallyMuted: muted,
    });
    updateParticipantGain(participantId);
  }

  function isLocallyMuted(participantId: string): boolean {
    return getState(participantId).locallyMuted;
  }

  function setDeafened(next: boolean): void {
    deafened = next;
    for (const participantId of participantState.keys()) {
      updateParticipantGain(participantId);
    }
    for (const chain of chains.values()) {
      if (!participantState.has(chain.participantId)) {
        updateParticipantGain(chain.participantId);
      }
    }
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    outputDeviceId = deviceId;
    if (!context || typeof context.setSinkId !== "function") return;
    await context.setSinkId(deviceId || "default").catch(() => undefined);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const chain of [...chains.values()]) {
      detach(chain.participantId, chain.trackSid);
    }
    chains.clear();
    participantState.clear();
    const activeContext = context;
    context = null;
    if (activeContext) void activeContext.close().catch(() => undefined);
  }

  return {
    attach,
    detach,
    detachParticipant,
    setVolume,
    setLocallyMuted,
    isLocallyMuted,
    setDeafened,
    setOutputDevice,
    dispose,
  };
}
