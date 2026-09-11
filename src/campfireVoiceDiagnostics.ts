import {
  Track,
  type LocalParticipant,
  type LocalTrackPublication,
} from "livekit-client";

export type CampfireMicrophonePublicationSnapshot = {
  count: number;
  expectedTrackSid: string | null;
  publications: Array<{
    trackSid: string;
    muted: boolean;
    expected: boolean;
  }>;
};

function microphonePublications(
  participant: LocalParticipant
): LocalTrackPublication[] {
  return Array.from(participant.trackPublications.values())
    .filter((publication): publication is LocalTrackPublication =>
      publication.source === Track.Source.Microphone
    );
}

function trackSid(publication: LocalTrackPublication): string {
  return publication.trackSid || "pending-microphone";
}

export function snapshotCampfireVoicePublications(
  participant: LocalParticipant,
  expectedPublication: LocalTrackPublication | null
): CampfireMicrophonePublicationSnapshot {
  const publications = microphonePublications(participant);
  return {
    count: publications.length,
    expectedTrackSid: expectedPublication ? trackSid(expectedPublication) : null,
    publications: publications.map((publication) => ({
      trackSid: trackSid(publication),
      muted: publication.isMuted === true,
      expected: publication === expectedPublication,
    })),
  };
}

export async function enforceSingleMicrophonePublication(
  participant: LocalParticipant,
  expectedPublication: LocalTrackPublication | null
): Promise<{ removed: number; remaining: CampfireMicrophonePublicationSnapshot }> {
  const publications = microphonePublications(participant);
  let removed = 0;

  for (const publication of publications) {
    if (publication === expectedPublication) continue;
    const track = publication.track;
    if (!track) continue;

    await participant.unpublishTrack(track, true);
    removed += 1;
  }

  return {
    removed,
    remaining: snapshotCampfireVoicePublications(participant, expectedPublication),
  };
}
