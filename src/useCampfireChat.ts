import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "./lib/supabase";

import { showCampfireNotification } from "./web/pwa";

/*
 * ============================================================
 * FONTES DISPONÍVEIS NO CAMPFIRE
 * ============================================================
 */

export const CAMPFIRE_FONT_FAMILIES = [
  "Segoe UI",
  "Tahoma",
  "Verdana",
  "Arial",
  "Trebuchet MS",

  "Comic Sans MS",

  "Calibri",
  "Cambria",
  "Century Gothic",

  "Georgia",
  "Times New Roman",
  "Palatino Linotype",

  "Courier New",
  "Lucida Console",
  "Lucida Sans Unicode",

  "Microsoft Sans Serif",

  "Segoe Print",
  "Segoe Script",

  "Franklin Gothic Medium",

  "Arial Black",
  "Impact",
] as const;


export const CAMPFIRE_FONT_SIZES = [
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  18,
  20,
  22,
  24,
  28,
  32,
  36,
] as const;


/*
 * ============================================================
 * ESTILO DE TEXTO
 * ============================================================
 */

export type CampfireTextStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;

  bold: boolean;
  italic: boolean;
  underline: boolean;
};


export const DEFAULT_CAMPFIRE_TEXT_STYLE:
  CampfireTextStyle = {
    fontFamily:
      "Segoe UI",

    fontSize:
      14,

    color:
      "#405761",

    bold:
      false,

    italic:
      false,

    underline:
      false,
  };


/*
 * ============================================================
 * TIPOS DE MENSAGEM
 * ============================================================
 */

export type CampfireMessageType =
  | "text"
  | "wink"
  | "audio"
  | "system";


export type CampfireChatMessage = {
  id: string;

  campfireId: string;

  senderId: string;

  messageType:
    CampfireMessageType;

  content: string;

  textStyle:
    CampfireTextStyle;

  winkKey:
    string | null;

  mediaPath:
    string | null;

  mediaUrl:
    string | null;

  mediaDurationMs:
    number | null;

  createdAt: string;

  senderUsername:
    string | null;

  senderDisplayName:
    string | null;

  senderAvatarUrl:
    string | null;
};


export type ChatActionResult = {
  ok: boolean;
  message: string;
};


type RawCampfireMessage = {
  id: string;

  campfire_id: string;

  sender_id: string;

  message_type:
    CampfireMessageType;

  content: string;

  text_style:
    unknown;

  wink_key:
    string | null;

  media_path:
    string | null;

  media_duration_ms:
    number | null;

  created_at: string;

  sender_username:
    string | null;

  sender_display_name:
    string | null;

  sender_avatar_url:
    string | null;
};


/*
 * ============================================================
 * NORMALIZAR ESTILO
 * ============================================================
 */

export function normalizeCampfireTextStyle(
  raw: unknown
): CampfireTextStyle {
  if (
    !raw ||
    typeof raw !==
      "object" ||
    Array.isArray(raw)
  ) {
    return {
      ...DEFAULT_CAMPFIRE_TEXT_STYLE,
    };
  }

  const value =
    raw as Record<
      string,
      unknown
    >;


  /*
   * Fonte
   */

  const fontFamily =
    typeof value.fontFamily ===
      "string" &&
    (
      CAMPFIRE_FONT_FAMILIES as
        readonly string[]
    ).includes(
      value.fontFamily
    )
      ? value.fontFamily
      : DEFAULT_CAMPFIRE_TEXT_STYLE
          .fontFamily;


  /*
   * Tamanho
   */

  const fontSize =
    typeof value.fontSize ===
      "number" &&
    (
      CAMPFIRE_FONT_SIZES as
        readonly number[]
    ).includes(
      value.fontSize
    )
      ? value.fontSize
      : DEFAULT_CAMPFIRE_TEXT_STYLE
          .fontSize;


  /*
   * Cor
   */

  const color =
    typeof value.color ===
      "string" &&
    /^#[0-9a-f]{6}$/i.test(
      value.color
    )
      ? value.color
      : DEFAULT_CAMPFIRE_TEXT_STYLE
          .color;


  return {
    fontFamily,

    fontSize,

    color,

    bold:
      value.bold ===
      true,

    italic:
      value.italic ===
      true,

    underline:
      value.underline ===
      true,
  };
}


/*
 * ============================================================
 * ERROS
 * ============================================================
 */

function mapChatError(
  error: unknown
): string {
  let message = "";

  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    message =
      String(
        (
          error as {
            message?: unknown;
          }
        ).message ??
          ""
      );
  }

  const normalized =
    message.toUpperCase();


  if (
    normalized.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return (
      "Sua sessão expirou."
    );
  }


  if (
    normalized.includes(
      "NOT_MEMBER"
    )
  ) {
    return (
      "Você precisa estar dentro da Campfire para conversar."
    );
  }


  if (
    normalized.includes(
      "CAMPFIRE_NOT_FOUND"
    )
  ) {
    return (
      "Essa Campfire não existe mais."
    );
  }


  if (
    normalized.includes(
      "INVALID_MESSAGE"
    )
  ) {
    return (
      "A mensagem deve ter entre 1 e 2000 caracteres."
    );
  }


  if (
    normalized.includes(
      "INVALID_TEXT_STYLE"
    )
  ) {
    return (
      "A formatação da mensagem é inválida."
    );
  }


  if (
    normalized.includes(
      "INVALID_WINK"
    )
  ) {
    return (
      "Essa Wink não é válida."
    );
  }


  return (
    message ||
    "Não foi possível concluir a operação."
  );
}


function errorMessageForAudio(
  error: unknown
): string {
  const mapped = mapChatError(error);

  let raw = "";

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    raw = String(
      (error as { message?: unknown }).message ?? ""
    ).toUpperCase();
  }

  if (
    raw.includes("BUCKET") ||
    raw.includes("STORAGE") ||
    raw.includes("SEND_CAMPFIRE_AUDIO_MESSAGE") ||
    raw.includes("FUNCTION")
  ) {
    return "O recurso de áudio ainda não foi ativado no Supabase. Execute campfire_social_voice_upgrade.sql no SQL Editor.";
  }

  return mapped;
}


/*
 * ============================================================
 * HOOK
 * ============================================================
 */

export function useCampfireChat(
  campfireId:
    string | null,

  active:
    boolean
) {
  const [
    messages,
    setMessages,
  ] =
    useState<
      CampfireChatMessage[]
    >([]);


  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );


  const [
    loadedOnce,
    setLoadedOnce,
  ] =
    useState(
      false
    );


  const [
    sending,
    setSending,
  ] =
    useState(
      false
    );


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    realtimeConnected,
    setRealtimeConnected,
  ] =
    useState(
      false
    );


  /*
   * =========================================================
   * TROCOU DE CAMPFIRE
   * =========================================================
   */

  useEffect(() => {
    setMessages([]);

    setError("");

    setLoadedOnce(
      false
    );
  }, [
    campfireId,
    active,
  ]);


  /*
   * =========================================================
   * CARREGAR
   * =========================================================
   */

  const refresh =
    useCallback(
      async (
        silent = false
      ) => {
        if (
          !campfireId ||
          !active
        ) {
          setMessages([]);

          setError("");

          setLoadedOnce(
            false
          );

          return;
        }


        if (
          !silent
        ) {
          setLoading(
            true
          );
        }


        try {
          const {
            data,
            error:
              rpcError,
          } =
            await supabase.rpc(
              "get_campfire_web_messages",
              {
                p_campfire_id:
                  campfireId,

                p_limit:
                  100,
              }
            );


          if (
            rpcError
          ) {
            throw rpcError;
          }


          const rows =
            (
              data ??
              []
            ) as RawCampfireMessage[];


          const next:
            CampfireChatMessage[] =
              rows.map(
                (
                  row
                ) => ({
                  id:
                    row.id,

                  campfireId:
                    row.campfire_id,

                  senderId:
                    row.sender_id,

                  messageType:
                    row.message_type,

                  content:
                    row.content,

                  textStyle:
                    normalizeCampfireTextStyle(
                      row.text_style
                    ),

                  winkKey:
                    row.wink_key,

                  mediaPath:
                    row.media_path,

                  mediaUrl:
                    null,

                  mediaDurationMs:
                    row.media_duration_ms,

                  createdAt:
                    row.created_at,

                  senderUsername:
                    row.sender_username,

                  senderDisplayName:
                    row.sender_display_name,

                  senderAvatarUrl:
                    row.sender_avatar_url,
                })
              );


          /*
           * Mensagens de áudio ficam em um bucket privado.
           * Criamos URLs temporárias somente para os arquivos
           * que realmente apareceram nesta Campfire.
           */

          const audioPaths = Array.from(
            new Set(
              next
                .filter(
                  (message) =>
                    message.messageType === "audio" &&
                    Boolean(message.mediaPath)
                )
                .map(
                  (message) =>
                    message.mediaPath as string
                )
            )
          );

          if (audioPaths.length > 0) {
            try {
              const {
                data: signedData,
                error: signedError,
              } = await supabase
                .storage
                .from("campfire-audio")
                .createSignedUrls(
                  audioPaths,
                  60 * 60
                );

              if (signedError) {
                throw signedError;
              }

              const signedMap =
                new Map<string, string>();

              for (const entry of signedData ?? []) {
                if (
                  typeof entry.path === "string" &&
                  typeof entry.signedUrl === "string"
                ) {
                  signedMap.set(
                    entry.path,
                    entry.signedUrl
                  );
                }
              }

              for (const message of next) {
                if (message.mediaPath) {
                  message.mediaUrl =
                    signedMap.get(message.mediaPath) ?? null;
                }
              }
            } catch (audioUrlError) {
              console.warn(
                "Não foi possível assinar os áudios do chat:",
                audioUrlError
              );
            }
          }

          setMessages(
            next
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Erro carregando chat:",
            loadError
          );

          setError(
            mapChatError(
              loadError
            )
          );
        } finally {
          setLoadedOnce(
            true
          );

          if (
            !silent
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        campfireId,
        active,
      ]
    );


  /*
   * =========================================================
   * CARREGAMENTO INICIAL
   * =========================================================
   */

  useEffect(() => {
    void refresh();
  }, [
    refresh,
  ]);


  /*
   * =========================================================
   * REALTIME
   * =========================================================
   */

  useEffect(() => {
    if (
      !campfireId ||
      !active
    ) {
      setRealtimeConnected(
        false
      );

      return;
    }


    const channel =
      supabase
        .channel(
          `campfire-chat-${campfireId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )

        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "campfire_messages",

            filter:
              `campfire_id=eq.${campfireId}`,
          },
          (payload) => {
            if (document.hidden) {
              const row = payload.new as { content?: unknown };
              const body = typeof row.content === "string" ? row.content.slice(0, 140) : "Nova mensagem";
              void showCampfireNotification("Nova mensagem no Campfire", { body });
            }
            void refresh(
              true
            );
          }
        )

        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "campfire_guest_messages",

            filter:
              `campfire_id=eq.${campfireId}`,
          },
          (payload) => {
            if (document.hidden) {
              const row = payload.new as { content?: unknown };
              const body = typeof row.content === "string" ? row.content.slice(0, 140) : "Nova mensagem";
              void showCampfireNotification("Nova mensagem no Campfire", { body });
            }
            void refresh(
              true
            );
          }
        )

        .subscribe(
          (
            status
          ) => {
            if (
              status ===
              "SUBSCRIBED"
            ) {
              setRealtimeConnected(
                true
              );

              console.log(
                `🔥 Chat Realtime conectado: ${campfireId}`
              );

              return;
            }


            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT" ||
              status ===
                "CLOSED"
            ) {
              setRealtimeConnected(
                false
              );
            }
          }
        );


    return () => {
      setRealtimeConnected(
        false
      );

      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    campfireId,
    active,
    refresh,
  ]);


  /*
   * =========================================================
   * FALLBACK
   * =========================================================
   */

  useEffect(() => {
    if (
      !campfireId ||
      !active
    ) {
      return;
    }


    const interval =
      window.setInterval(
        () => {
          void refresh(
            true
          );
        },
        30000
      );


    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    campfireId,
    active,
    refresh,
  ]);


  /*
   * =========================================================
   * ENVIAR TEXTO
   * =========================================================
   */

  async function sendMessage(
    content:
      string,

    textStyle:
      CampfireTextStyle
  ): Promise<ChatActionResult> {
    if (
      !campfireId ||
      !active
    ) {
      return {
        ok: false,

        message:
          "Você não está dentro de uma Campfire.",
      };
    }


    const cleanContent =
      content.trim();


    if (
      cleanContent.length <
        1 ||
      cleanContent.length >
        2000
    ) {
      return {
        ok: false,

        message:
          "A mensagem deve ter entre 1 e 2000 caracteres.",
      };
    }


    if (
      sending
    ) {
      return {
        ok: false,

        message:
          "Aguarde o envio anterior.",
      };
    }


    const safeStyle =
      normalizeCampfireTextStyle(
        textStyle
      );


    setSending(
      true
    );

    setError("");


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "send_campfire_message",
          {
            p_campfire_id:
              campfireId,

            p_content:
              cleanContent,

            p_text_style:
              safeStyle,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      if (
        typeof data !==
        "string"
      ) {
        throw new Error(
          "O banco não retornou o ID da mensagem."
        );
      }


      /*
       * Não esperamos o Realtime
       * voltar para mostrar nossa
       * própria mensagem.
       */

      await refresh(
        true
      );


      return {
        ok: true,

        message:
          "Mensagem enviada.",
      };
    } catch (
      sendError
    ) {
      console.error(
        "Erro enviando mensagem:",
        sendError
      );


      const mapped =
        mapChatError(
          sendError
        );


      setError(
        mapped
      );


      return {
        ok: false,

        message:
          mapped,
      };
    } finally {
      setSending(
        false
      );
    }
  }


  /*
   * =========================================================
   * ENVIAR ÁUDIO
   * =========================================================
   */

  async function sendAudioMessage(
    blob: Blob,
    durationMs: number,
    mimeType: string
  ): Promise<ChatActionResult> {
    if (!campfireId || !active) {
      return {
        ok: false,
        message: "Você não está dentro de uma Campfire.",
      };
    }

    if (sending) {
      return {
        ok: false,
        message: "Aguarde o envio anterior.",
      };
    }

    if (
      blob.size < 1 ||
      durationMs < 300 ||
      durationMs > 120000
    ) {
      return {
        ok: false,
        message: "A mensagem de áudio deve ter no máximo 2 minutos.",
      };
    }

    setSending(true);
    setError("");

    let uploadedPath = "";

    try {
      const { data: authData } =
        await supabase.auth.getSession();

      const userId = authData.session?.user.id;

      if (!userId) {
        throw new Error("NOT_AUTHENTICATED");
      }

      const normalizedMime = mimeType.toLowerCase();

      const extension =
        normalizedMime.includes("ogg")
          ? "ogg"
          : normalizedMime.includes("mp4") ||
              normalizedMime.includes("m4a")
            ? "m4a"
            : normalizedMime.includes("mpeg") ||
                normalizedMime.includes("mp3")
              ? "mp3"
              : "webm";

      const uploadContentType =
        normalizedMime.includes("ogg")
          ? "audio/ogg"
          : normalizedMime.includes("mp4") ||
              normalizedMime.includes("m4a")
            ? "audio/mp4"
            : normalizedMime.includes("mpeg") ||
                normalizedMime.includes("mp3")
              ? "audio/mpeg"
              : "audio/webm";

      uploadedPath =
        `${campfireId}/${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } =
        await supabase
          .storage
          .from("campfire-audio")
          .upload(uploadedPath, blob, {
            contentType: uploadContentType,
            cacheControl: "3600",
            upsert: false,
          });

      if (uploadError) {
        throw uploadError;
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          "send_campfire_audio_message",
          {
            p_campfire_id: campfireId,
            p_media_path: uploadedPath,
            p_duration_ms: Math.round(durationMs),
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (typeof data !== "string") {
        throw new Error(
          "O banco não retornou o ID da mensagem de áudio."
        );
      }

      await refresh(true);

      return {
        ok: true,
        message: "Mensagem de áudio enviada.",
      };
    } catch (audioError) {
      console.error(
        "Erro enviando mensagem de áudio:",
        audioError
      );

      if (uploadedPath) {
        void supabase
          .storage
          .from("campfire-audio")
          .remove([uploadedPath])
          .catch(() => undefined);
      }

      const mapped =
        errorMessageForAudio(audioError);

      setError(mapped);

      return {
        ok: false,
        message: mapped,
      };
    } finally {
      setSending(false);
    }
  }


  /*
   * =========================================================
   * ENVIAR WINK
   * =========================================================
   */

  async function sendWink(
    winkKey:
      string
  ): Promise<ChatActionResult> {
    if (
      !campfireId ||
      !active
    ) {
      return {
        ok: false,

        message:
          "Você não está dentro de uma Campfire.",
      };
    }


    if (
      !winkKey ||
      winkKey.length >
        64
    ) {
      return {
        ok: false,

        message:
          "Wink inválida.",
      };
    }


    if (
      sending
    ) {
      return {
        ok: false,

        message:
          "Aguarde o envio anterior.",
      };
    }


    setSending(
      true
    );

    setError("");


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "send_campfire_wink",
          {
            p_campfire_id:
              campfireId,

            p_wink_key:
              winkKey,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      if (
        typeof data !==
        "string"
      ) {
        throw new Error(
          "O banco não retornou o ID da Wink."
        );
      }


      await refresh(
        true
      );


      return {
        ok: true,

        message:
          "Wink enviada.",
      };
    } catch (
      winkError
    ) {
      console.error(
        "Erro enviando Wink:",
        winkError
      );


      const mapped =
        mapChatError(
          winkError
        );


      setError(
        mapped
      );


      return {
        ok: false,

        message:
          mapped,
      };
    } finally {
      setSending(
        false
      );
    }
  }


  return {
    messages,

    loading,

    loadedOnce,

    sending,

    error,

    realtimeConnected,

    refresh,

    sendMessage,

    sendAudioMessage,

    sendWink,
  };
}