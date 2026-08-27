import { useCampfireLiveKitBroadcast } from "./useCampfireLiveKitBroadcast";
import { useCampfireWebRTC as useCampfireWebRTCLegacy } from "./useCampfireWebRTCLegacy";

export type { CampfireScreenSession, WebRTCViewerState, WebRTCActionResult } from "./useCampfireLiveKitBroadcast";

const MEDIA_TRANSPORT =
  (import.meta.env.VITE_CAMPFIRE_MEDIA_TRANSPORT || "livekit").toLowerCase();

export const useCampfireWebRTC =
  MEDIA_TRANSPORT === "legacy-p2p"
    ? useCampfireWebRTCLegacy
    : useCampfireLiveKitBroadcast;
