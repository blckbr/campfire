export type MediaPurpose =
  | "voice"
  | "watch"
  | "screen"
  | "direct-call";

export type CampfireMediaPermissions = {
  canPublishMicrophone: boolean;
  canPublishCamera: boolean;
  canPublishScreen: boolean;
  canSubscribe: boolean;
};

export type ModerationFlags = {
  roomVoiceMuted?: boolean;
  roomVideoDisabled?: boolean;
  roomScreenDisabled?: boolean;
};

export function mediaPermissionsFor(
  purpose: MediaPurpose,
  flags: ModerationFlags = {}
): CampfireMediaPermissions {
  const canPublishMicrophone =
    purpose !== "watch" && !flags.roomVoiceMuted;
  const canPublishCamera =
    (purpose === "voice" || purpose === "direct-call") &&
    !flags.roomVideoDisabled;
  const canPublishScreen =
    (purpose === "watch" || purpose === "screen") &&
    !flags.roomScreenDisabled;

  return {
    canPublishMicrophone,
    canPublishCamera,
    canPublishScreen,
    canSubscribe: true,
  };
}

export function allowedPublishSources(
  permissions: CampfireMediaPermissions
): Array<"microphone" | "camera" | "screen_share" | "screen_share_audio"> {
  const sources: Array<
    "microphone" | "camera" | "screen_share" | "screen_share_audio"
  > = [];

  if (permissions.canPublishMicrophone) sources.push("microphone");
  if (permissions.canPublishCamera) sources.push("camera");
  if (permissions.canPublishScreen) {
    sources.push("screen_share", "screen_share_audio");
  }

  return sources;
}
