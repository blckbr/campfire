import { useCampfireLiveKitVoice } from "./useCampfireLiveKitVoice";
import { useCampfireVoice as useCampfireVoiceLegacy } from "./useCampfireVoiceLegacy";

export type {
  CampfirePresenceStatus,
  CampfirePresenceMember,
  CampfireVoiceActionResult,
  CampfireVoiceController,
} from "./useCampfireLiveKitVoice";

const MEDIA_TRANSPORT =
  (import.meta.env.VITE_CAMPFIRE_MEDIA_TRANSPORT || "livekit").toLowerCase();

// Normal production path is LiveKit SFU. The old peer-per-user transport is
// available only for explicit development/regression work.
export const useCampfireVoice: typeof useCampfireLiveKitVoice =
  (MEDIA_TRANSPORT === "legacy-p2p"
    ? useCampfireVoiceLegacy
    : useCampfireLiveKitVoice) as typeof useCampfireLiveKitVoice;
