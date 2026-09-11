import { supabase } from "../lib/supabase";
import { campfireConnectionId } from "../web/platform";
import type { MediaPurpose } from "./campfireMediaPolicy";

export type CampfireMediaToken = {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  principalId?: string;
  connectionId: string;
  publishingLease?: boolean;
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
  publishing?: boolean;
}): Promise<CampfireMediaToken> {
  const connectionId = campfireConnectionId();
  const { data, error } = await supabase.functions.invoke<CampfireMediaToken>(
    "campfire-media-token",
    {
      body: {
        campfireId: input.campfireId,
        purpose: input.purpose,
        voiceChannelId: input.voiceChannelId ?? undefined,
        callId: input.callId ?? undefined,
        connectionId,
        publishing: input.publishing,
      },
    }
  );

  if (error) throw error;
  if (!data?.url || !data.token || !data.roomName || !data.identity) {
    throw new Error("O serviço de mídia retornou uma resposta incompleta.");
  }
  return { ...data, connectionId: data.connectionId || connectionId };
}
