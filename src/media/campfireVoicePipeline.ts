import {
  audioInputConstraint,
  type CampfireMediaSettings,
} from "../campfireMediaSettings";
import { createCampfireRnnoiseNode } from "./campfireRnnoise";
import {
  campfireVolumeToGain,
  configureCampfireCompressor,
  configureCampfireLimiter,
} from "./voiceProcessing";

export type CampfireVoicePipeline = {
  context: AudioContext;
  rawStream: MediaStream;
  processedTrack: MediaStreamTrack;
  outgoingGain: GainNode;
  monitorGain: GainNode;
  originalAnalyser: AnalyserNode;
  processedAnalyser: AnalyserNode;
  rnnoiseActive: boolean;
  setOutgoingVolume(value: number): void;
  setMonitor(
    enabled: boolean,
    value: number,
    source?: "original" | "processed"
  ): void;
  setMuted(muted: boolean): void;
  dispose(): Promise<void>;
};

export type CampfireVoicePipelineOptions = {
  settings: CampfireMediaSettings;
  outgoingVolume: number;
  monitorEnabled: boolean;
  monitorVolume: number;
};

function gateThresholdDb(settings: CampfireMediaSettings): number {
  if (settings.gateMode === "auto") return -48;
  const normalized = Math.max(
    0,
    Math.min(100, settings.gateSensitivity)
  );
  return -62 + normalized * 0.34;
}

async function createGateNode(
  context: AudioContext,
  settings: CampfireMediaSettings
): Promise<AudioWorkletNode | null> {
  if (
    settings.voiceProfile === "studio" ||
    settings.gateMode === "off"
  ) {
    return null;
  }

  try {
    const moduleUrl = new URL(
      "./audio/campfire-voice-gate.js",
      window.location.href
    ).href;
    await context.audioWorklet.addModule(moduleUrl);
    const gate = new AudioWorkletNode(
      context,
      "campfire-voice-gate"
    );
    gate.parameters
      .get("thresholdDb")
      ?.setValueAtTime(gateThresholdDb(settings), context.currentTime);
    gate.parameters
      .get("floorGain")
      ?.setValueAtTime(0.18, context.currentTime);
    return gate;
  } catch (error) {
    console.warn(
      "Campfire Voice Pro: gate local indisponível; continuando sem gate.",
      error
    );
    return null;
  }
}

export async function createCampfireVoicePipeline(
  options: CampfireVoicePipelineOptions
): Promise<CampfireVoicePipeline> {
  const {
    settings,
    outgoingVolume,
    monitorEnabled,
    monitorVolume,
  } = options;

  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: audioInputConstraint(settings.audioInputId, settings),
    video: false,
  });
  const rawTrack = rawStream.getAudioTracks()[0];

  if (!rawTrack) {
    rawStream.getTracks().forEach((track) => track.stop());
    throw new Error("Nenhum microfone foi encontrado.");
  }

  const context = new AudioContext({ sampleRate: 48000 });
  await context.resume().catch(() => undefined);

  try {
    const source = context.createMediaStreamSource(rawStream);
    const originalAnalyser = context.createAnalyser();
    originalAnalyser.fftSize = 1024;
    originalAnalyser.smoothingTimeConstant = 0.7;
    source.connect(originalAnalyser);

    let currentNode: AudioNode = originalAnalyser;
    let rnnoiseActive = false;

    if (settings.voiceProfile === "strong") {
      const rnnoise = await createCampfireRnnoiseNode(context);
      if (rnnoise) {
        currentNode.connect(rnnoise);
        currentNode = rnnoise;
        rnnoiseActive = true;
      }
    }

    const gate = await createGateNode(context, settings);
    if (gate) {
      currentNode.connect(gate);
      currentNode = gate;
    }

    if (settings.voiceProfile !== "studio") {
      const compressor = context.createDynamicsCompressor();
      configureCampfireCompressor(compressor);
      currentNode.connect(compressor);
      currentNode = compressor;
    }

    const processedAnalyser = context.createAnalyser();
    processedAnalyser.fftSize = 1024;
    processedAnalyser.smoothingTimeConstant = 0.72;
    currentNode.connect(processedAnalyser);

    const outgoingGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    configureCampfireLimiter(limiter);
    const destination = context.createMediaStreamDestination();

    processedAnalyser.connect(outgoingGain);
    outgoingGain.connect(limiter);
    limiter.connect(destination);

    const originalMonitorGain = context.createGain();
    const originalMonitorLimiter = context.createDynamicsCompressor();
    configureCampfireLimiter(originalMonitorLimiter);
    originalAnalyser.connect(originalMonitorGain);
    originalMonitorGain.connect(originalMonitorLimiter);
    originalMonitorLimiter.connect(context.destination);

    const monitorGain = context.createGain();
    const monitorLimiter = context.createDynamicsCompressor();
    configureCampfireLimiter(monitorLimiter);
    processedAnalyser.connect(monitorGain);
    monitorGain.connect(monitorLimiter);
    monitorLimiter.connect(context.destination);

    const processedTrack = destination.stream.getAudioTracks()[0];
    if (!processedTrack) {
      throw new Error(
        "Não foi possível criar a faixa processada do microfone."
      );
    }

    let currentOutgoingVolume = outgoingVolume;
    let currentMuted = false;
    let disposed = false;

    const applyOutgoingGain = () => {
      outgoingGain.gain.value = currentMuted
        ? 0
        : campfireVolumeToGain(currentOutgoingVolume);
    };

    const setOutgoingVolume = (value: number) => {
      currentOutgoingVolume = value;
      applyOutgoingGain();
    };

    const setMonitor = (
      enabled: boolean,
      value: number,
      source: "original" | "processed" = "processed"
    ) => {
      const gain = enabled
        ? campfireVolumeToGain(value)
        : 0;
      originalMonitorGain.gain.value =
        enabled && source === "original" ? gain : 0;
      monitorGain.gain.value =
        enabled && source === "processed" ? gain : 0;
    };

    const setMuted = (muted: boolean) => {
      currentMuted = muted;
      processedTrack.enabled = !muted;
      applyOutgoingGain();
    };

    applyOutgoingGain();
    setMonitor(monitorEnabled, monitorVolume);
    processedTrack.enabled = true;

    return {
      context,
      rawStream,
      processedTrack,
      outgoingGain,
      monitorGain,
      originalAnalyser,
      processedAnalyser,
      rnnoiseActive,
      setOutgoingVolume,
      setMonitor,
      setMuted,
      async dispose() {
        if (disposed) return;
        disposed = true;
        processedTrack.stop();
        rawStream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    rawStream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
    throw error;
  }
}
