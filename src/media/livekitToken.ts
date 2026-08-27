import { supabase } from "../lib/supabase";
import type { MediaPurpose } from "./campfireMediaPolicy";

export type CampfireMediaToken = {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  permissions: {
    canPublishMicrophone: boolean;
    canPublishCamera: boolean;
    canPublishScreen: boolean;
    canSubscribe: boolean;
  };
};

export async function requestCampfireMediaToken(input: {
  campfireId: string;
  purpose: MediaPurpose;
  voiceChannelId?: string | null;
  callId?: string | null;
}): Promise<CampfireMediaToken> {
  const { data, error } = await supabase.functions.invoke<CampfireMediaToken>(
    "campfire-media-token",
    {
      body: {
        campfireId: input.campfireId,
        purpose: input.purpose,
        voiceChannelId: input.voiceChannelId ?? undefined,
        callId: input.callId ?? undefined,
      },
    }
  );

  if (error) throw error;
  if (!data?.url || !data.token || !data.roomName || !data.identity) {
    throw new Error("O serviço de mídia retornou uma resposta incompleta.");
  }
  return data;
}
