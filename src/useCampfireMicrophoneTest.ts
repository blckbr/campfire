import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CampfireMediaSettings } from "./campfireMediaSettings";
import {
  createCampfireVoicePipeline,
  type CampfireVoicePipeline,
} from "./media/campfireVoicePipeline";
import { campfireAnalyserLevel } from "./media/voiceProcessing";

export type CampfireMicrophoneMonitorSource =
  | "original"
  | "processed";

export type CampfireMicrophoneTestController = {
  testing: boolean;
  originalLevel: number;
  processedLevel: number;
  listening: boolean;
  monitorSource: CampfireMicrophoneMonitorSource;
  rnnoiseActive: boolean;
  processedStream: MediaStream | null;
  error: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  setListening(enabled: boolean): void;
  setMonitorSource(source: CampfireMicrophoneMonitorSource): void;
  getProcessedStream(): MediaStream | null;
};

function isUnavailableSelectedMicrophone(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" ||
      error.name === "OverconstrainedError")
  );
}

export function useCampfireMicrophoneTest(
  settings: CampfireMediaSettings,
  outgoingVolume = 100,
  monitorVolume = 100
): CampfireMicrophoneTestController {
  const [testing, setTesting] = useState(false);
  const [originalLevel, setOriginalLevel] = useState(0);
  const [processedLevel, setProcessedLevel] = useState(0);
  const [listening, setListeningState] = useState(false);
  const [monitorSource, setMonitorSourceState] =
    useState<CampfireMicrophoneMonitorSource>("processed");
  const [rnnoiseActive, setRnnoiseActive] = useState(false);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");

  const settingsSignature = JSON.stringify([
    settings.audioInputId,
    settings.voiceProfile,
    settings.echoCancellation,
    settings.nativeNoiseSuppression,
    settings.autoGainControl,
    settings.gateMode,
    settings.gateSensitivity,
  ]);
  const settingsRef = useRef(settings);
  const settingsSignatureRef = useRef(settingsSignature);
  const activeSettingsSignatureRef = useRef("");
  settingsRef.current = settings;
  settingsSignatureRef.current = settingsSignature;
  const pipelineRef = useRef<CampfireVoicePipeline | null>(null);
  const meterFrameRef = useRef(0);
  const listeningRef = useRef(false);
  const monitorSourceRef =
    useRef<CampfireMicrophoneMonitorSource>("processed");

  const stop = useCallback(async () => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = 0;
    }

    const pipeline = pipelineRef.current;
    pipelineRef.current = null;
    await pipeline?.dispose();
    setOriginalLevel(0);
    setProcessedLevel(0);
    setRnnoiseActive(false);
    setProcessedStream(null);
    setTesting(false);
  }, []);

  const start = useCallback(async () => {
    await stop();
    setError("");

    try {
      activeSettingsSignatureRef.current = settingsSignatureRef.current;
      const requestedSettings = settingsRef.current;
      let pipeline: CampfireVoicePipeline;
      try {
        pipeline = await createCampfireVoicePipeline({
          settings: requestedSettings,
          outgoingVolume,
          monitorEnabled: listeningRef.current,
          monitorVolume,
        });
      } catch (pipelineError) {
        if (
          !requestedSettings.audioInputId ||
          !isUnavailableSelectedMicrophone(pipelineError)
        ) {
          throw pipelineError;
        }

        // Um ID salvo pode deixar de existir após trocar/desconectar um headset.
        // Nesse caso, recupere o microfone padrão em vez de deixar o teste morto.
        pipeline = await createCampfireVoicePipeline({
          settings: {
            ...requestedSettings,
            audioInputId: "",
          },
          outgoingVolume,
          monitorEnabled: listeningRef.current,
          monitorVolume,
        });
      }
      pipeline.setMonitor(
        listeningRef.current,
        monitorVolume,
        monitorSourceRef.current
      );
      pipelineRef.current = pipeline;
      setProcessedStream(new MediaStream([pipeline.processedTrack]));
      setRnnoiseActive(pipeline.rnnoiseActive);
      setTesting(true);

      const originalData = new Float32Array(
        pipeline.originalAnalyser.fftSize
      );
      const processedData = new Float32Array(
        pipeline.processedAnalyser.fftSize
      );

      const updateMeters = () => {
        if (pipelineRef.current !== pipeline) return;
        setOriginalLevel(
          campfireAnalyserLevel(pipeline.originalAnalyser, originalData)
        );
        setProcessedLevel(
          campfireAnalyserLevel(pipeline.processedAnalyser, processedData)
        );
        meterFrameRef.current = window.requestAnimationFrame(
          updateMeters
        );
      };

      updateMeters();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Não foi possível testar o microfone."
      );
      await stop();
      throw startError;
    }
  }, [monitorVolume, outgoingVolume, stop]);

  useEffect(() => {
    if (!pipelineRef.current) return;
    if (activeSettingsSignatureRef.current === settingsSignature) return;
    activeSettingsSignatureRef.current = settingsSignature;
    void start().catch(() => undefined);
  }, [settingsSignature, start]);

  const setListening = useCallback((enabled: boolean) => {
    listeningRef.current = enabled;
    setListeningState(enabled);
    pipelineRef.current?.setMonitor(
      enabled,
      monitorVolume,
      monitorSourceRef.current
    );
  }, [monitorVolume]);

  const setMonitorSource = useCallback(
    (source: CampfireMicrophoneMonitorSource) => {
      monitorSourceRef.current = source;
      setMonitorSourceState(source);
      pipelineRef.current?.setMonitor(
        listeningRef.current,
        monitorVolume,
        source
      );
    },
    [monitorVolume]
  );

  useEffect(() => {
    pipelineRef.current?.setOutgoingVolume(outgoingVolume);
  }, [outgoingVolume]);

  useEffect(() => {
    pipelineRef.current?.setMonitor(
      listeningRef.current,
      monitorVolume,
      monitorSourceRef.current
    );
  }, [monitorVolume]);

  const getProcessedStream = useCallback(() => {
    const track = pipelineRef.current?.processedTrack;
    return track ? new MediaStream([track]) : null;
  }, []);

  useEffect(() => () => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
    }
    void pipelineRef.current?.dispose();
    pipelineRef.current = null;
  }, []);

  return {
    testing,
    originalLevel,
    processedLevel,
    listening,
    monitorSource,
    rnnoiseActive,
    processedStream,
    error,
    start,
    stop,
    setListening,
    setMonitorSource,
    getProcessedStream,
  };
}
