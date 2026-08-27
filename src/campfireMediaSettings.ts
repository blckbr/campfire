export type CampfireAudioProfile = "voice" | "studio";
export type CampfireVoiceProfile = "clean" | "strong" | "studio";
export type CampfireGateMode = "auto" | "manual" | "off";
export type CampfireVideoQuality = "auto" | "economy" | "hd" | "full-hd";

export type CampfireMediaSettings = {
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
  voiceProfile: CampfireVoiceProfile;
  /** Compatibilidade temporária com os caminhos Legacy/direct-call. */
  audioProfile: CampfireAudioProfile;
  echoCancellation: boolean;
  nativeNoiseSuppression: boolean;
  autoGainControl: boolean;
  gateMode: CampfireGateMode;
  gateSensitivity: number;
  videoQuality: CampfireVideoQuality;
};

export const CAMPFIRE_MEDIA_SETTINGS_KEY =
  "campfire.media.settings.v1";

export const CAMPFIRE_MEDIA_SETTINGS_EVENT =
  "campfire-media-settings-change";

export const DEFAULT_CAMPFIRE_MEDIA_SETTINGS:
  CampfireMediaSettings = {
    audioInputId: "",
    videoInputId: "",
    audioOutputId: "",
    voiceProfile: "clean",
    audioProfile: "voice",
    echoCancellation: true,
    nativeNoiseSuppression: true,
    autoGainControl: true,
    gateMode: "auto",
    gateSensitivity: 50,
    videoQuality: "auto",
  };

function normalizedGateSensitivity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 50;
}

function normalizedVoiceProfile(
  parsed: Partial<CampfireMediaSettings>
): CampfireVoiceProfile {
  if (
    parsed.voiceProfile === "clean" ||
    parsed.voiceProfile === "strong" ||
    parsed.voiceProfile === "studio"
  ) {
    return parsed.voiceProfile;
  }

  if (parsed.audioProfile === "studio") return "studio";
  if (parsed.audioProfile === "voice") return "clean";
  return "clean";
}

export function loadCampfireMediaSettings():
  CampfireMediaSettings {
  try {
    const raw = localStorage.getItem(
      CAMPFIRE_MEDIA_SETTINGS_KEY
    );

    if (!raw) {
      return {
        ...DEFAULT_CAMPFIRE_MEDIA_SETTINGS,
      };
    }

    const parsed = JSON.parse(raw) as Partial<
      CampfireMediaSettings
    >;
    const voiceProfile = normalizedVoiceProfile(parsed);

    return {
      audioInputId:
        typeof parsed.audioInputId === "string"
          ? parsed.audioInputId
          : "",
      videoInputId:
        typeof parsed.videoInputId === "string"
          ? parsed.videoInputId
          : "",
      audioOutputId:
        typeof parsed.audioOutputId === "string"
          ? parsed.audioOutputId
          : "",
      voiceProfile,
      audioProfile:
        voiceProfile === "studio"
          ? "studio"
          : "voice",
      echoCancellation:
        typeof parsed.echoCancellation === "boolean"
          ? parsed.echoCancellation
          : voiceProfile !== "studio",
      nativeNoiseSuppression:
        typeof parsed.nativeNoiseSuppression === "boolean"
          ? parsed.nativeNoiseSuppression
          : voiceProfile !== "studio",
      autoGainControl:
        typeof parsed.autoGainControl === "boolean"
          ? parsed.autoGainControl
          : voiceProfile !== "studio",
      gateMode:
        parsed.gateMode === "manual" ||
        parsed.gateMode === "off"
          ? parsed.gateMode
          : "auto",
      gateSensitivity:
        normalizedGateSensitivity(parsed.gateSensitivity),
      videoQuality:
        parsed.videoQuality === "economy" ||
        parsed.videoQuality === "hd" ||
        parsed.videoQuality === "full-hd"
          ? parsed.videoQuality
          : "auto",
    };
  } catch {
    return {
      ...DEFAULT_CAMPFIRE_MEDIA_SETTINGS,
    };
  }
}

export function saveCampfireMediaSettings(
  settings: CampfireMediaSettings
): void {
  const normalized: CampfireMediaSettings = {
    ...settings,
    audioProfile:
      settings.voiceProfile === "studio"
        ? "studio"
        : "voice",
    gateSensitivity:
      normalizedGateSensitivity(settings.gateSensitivity),
  };

  try {
    localStorage.setItem(
      CAMPFIRE_MEDIA_SETTINGS_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // Persistência local é opcional.
  }

  window.dispatchEvent(
    new CustomEvent(
      CAMPFIRE_MEDIA_SETTINGS_EVENT,
      {
        detail: normalized,
      }
    )
  );
}

type CampfireAudioConstraintSettings = Pick<
  CampfireMediaSettings,
  | "voiceProfile"
  | "echoCancellation"
  | "nativeNoiseSuppression"
  | "autoGainControl"
>;

export function audioInputConstraint(
  deviceId: string,
  settings: Pick<
    CampfireMediaSettings,
    | "voiceProfile"
    | "echoCancellation"
    | "nativeNoiseSuppression"
    | "autoGainControl"
  >
): MediaTrackConstraints;
export function audioInputConstraint(
  deviceId: string,
  audioProfile?: CampfireAudioProfile
): MediaTrackConstraints;
export function audioInputConstraint(
  deviceId: string,
  settingsOrProfile: CampfireAudioConstraintSettings | CampfireAudioProfile = "voice"
): MediaTrackConstraints {
  const settings: CampfireAudioConstraintSettings =
    typeof settingsOrProfile === "string"
      ? {
          voiceProfile:
            settingsOrProfile === "studio"
              ? "studio"
              : "clean",
          echoCancellation:
            settingsOrProfile !== "studio",
          nativeNoiseSuppression:
            settingsOrProfile !== "studio",
          autoGainControl:
            settingsOrProfile !== "studio",
        }
      : settingsOrProfile;
  const isStudio = settings.voiceProfile === "studio";

  return {
    ...(deviceId
      ? {
          deviceId: {
            exact: deviceId,
          },
        }
      : {}),
    channelCount: isStudio ? { ideal: 2 } : { ideal: 1 },
    sampleRate: { ideal: 48000 },
    echoCancellation:
      isStudio ? false : settings.echoCancellation,
    noiseSuppression:
      isStudio ? false : settings.nativeNoiseSuppression,
    autoGainControl:
      isStudio ? false : settings.autoGainControl,
  };
}

export function videoInputConstraint(
  deviceId: string,
  quality: CampfireVideoQuality = "auto"
): MediaTrackConstraints | true {
  const qualityConstraints: Record<CampfireVideoQuality, MediaTrackConstraints> = {
    auto: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    },
    economy: {
      width: { ideal: 640, max: 854 },
      height: { ideal: 360, max: 480 },
      frameRate: { ideal: 24, max: 30 },
    },
    hd: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    "full-hd": {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
    },
  };

  return {
    ...qualityConstraints[quality],
    ...(deviceId
      ? { deviceId: { exact: deviceId } }
      : {}),
  };
}
