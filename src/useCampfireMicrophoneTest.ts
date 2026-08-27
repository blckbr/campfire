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
  error: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  setListening(enabled: boolean): void;
  setMonitorSource(source: CampfireMicrophoneMonitorSource): void;
};

export function useCampfireMicrophoneTest(
  settings: CampfireMediaSettings
): CampfireMicrophoneTestController {
  const [testing, setTesting] = useState(false);
  const [originalLevel, setOriginalLevel] = useState(0);
  const [processedLevel, setProcessedLevel] = useState(0);
  const [listening, setListeningState] = useState(false);
  const [monitorSource, setMonitorSourceState] =
    useState<CampfireMicrophoneMonitorSource>("processed");
  const [rnnoiseActive, setRnnoiseActive] = useState(false);
  const [error, setError] = useState("");

  const settingsRef = useRef(settings);
  const pipelineRef = useRef<CampfireVoicePipeline | null>(null);
  const meterFrameRef = useRef(0);
  const listeningRef = useRef(false);
  const monitorSourceRef =
    useRef<CampfireMicrophoneMonitorSource>("processed");

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
    setTesting(false);
  }, []);

  const start = useCallback(async () => {
    await stop();
    setError("");

    try {
      const pipeline = await createCampfireVoicePipeline({
        settings: settingsRef.current,
        outgoingVolume: 100,
        monitorEnabled: listeningRef.current,
        monitorVolume: 100,
      });
      pipeline.setMonitor(
        listeningRef.current,
        100,
        monitorSourceRef.current
      );
      pipelineRef.current = pipeline;
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
  }, [stop]);

  const setListening = useCallback((enabled: boolean) => {
    listeningRef.current = enabled;
    setListeningState(enabled);
    pipelineRef.current?.setMonitor(
      enabled,
      100,
      monitorSourceRef.current
    );
  }, []);

  const setMonitorSource = useCallback(
    (source: CampfireMicrophoneMonitorSource) => {
      monitorSourceRef.current = source;
      setMonitorSourceState(source);
      pipelineRef.current?.setMonitor(
        listeningRef.current,
        100,
        source
      );
    },
    []
  );

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
    error,
    start,
    stop,
    setListening,
    setMonitorSource,
  };
}
