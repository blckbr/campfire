import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
} from "react";

import {
  CAMPFIRE_FONT_FAMILIES,
  CAMPFIRE_FONT_SIZES,
  DEFAULT_CAMPFIRE_TEXT_STYLE,
  normalizeCampfireTextStyle,
  useCampfireChat,
} from "./useCampfireChat";

import type {
  CampfireChatMessage,
  CampfireTextStyle,
} from "./useCampfireChat";

import {
  audioInputConstraint,
  loadCampfireMediaSettings,
} from "./campfireMediaSettings";

import type { CampfireVoiceController } from "./useCampfireVoice";
import type { useCampfireMembers } from "./useCampfireMembers";
import UserContextMenu from "./UserContextMenu";
import CampfireModeratorView from "./CampfireModeratorView";
import { useCampfireModeration } from "./useCampfireModeration";
import { getUserLocalMediaPreference } from "./userLocalMediaPreferences";

import "./CampfireChat.css";


/*
 * ============================================================
 * STORAGE LOCAL
 * ============================================================
 *
 * Assim como um mensageiro desktop,
 * o Campfire lembra a última fonte,
 * tamanho e cor escolhidos.
 * ============================================================
 */

const STYLE_STORAGE_KEY =
  "campfire.chat.textStyle";


/*
 * ============================================================
 * EMOTICONS
 * ============================================================
 */

const EMOTICONS = [
  {
    emoji: "🙂",
    code: ":)",
    label: "Smile",
  },

  {
    emoji: "😄",
    code: ":D",
    label: "Big smile",
  },

  {
    emoji: "😉",
    code: ";)",
    label: "Wink",
  },

  {
    emoji: "☹️",
    code: ":(",
    label: "Sad",
  },

  {
    emoji: "😛",
    code: ":P",
    label: "Tongue",
  },

  {
    emoji: "😮",
    code: ":O",
    label: "Surprised",
  },

  {
    emoji: "😎",
    code: "8)",
    label: "Cool",
  },

  {
    emoji: "😂",
    code: "XD",
    label: "Laugh",
  },

  {
    emoji: "😭",
    code: ":'(",
    label: "Cry",
  },

  {
    emoji: "😡",
    code: ">:(",
    label: "Angry",
  },

  {
    emoji: "❤️",
    code: "<3",
    label: "Heart",
  },

  {
    emoji: "👍",
    code: "(y)",
    label: "Like",
  },

  {
    emoji: "🔥",
    code: "(fire)",
    label: "Fire",
  },

  {
    emoji: "😇",
    code: "O:)",
    label: "Angel",
  },

  {
    emoji: "😈",
    code: "}:)",
    label: "Devil",
  },

  {
    emoji: "😘",
    code: ":*",
    label: "Kiss",
  },
];


/*
 * ============================================================
 * WINKS
 * ============================================================
 */

const WINKS = [
  {
    key: "fire_burst",
    emoji: "🔥",
    label: "Flame Burst",
  },

  {
    key: "fireworks",
    emoji: "🎆",
    label: "Fireworks",
  },

  {
    key: "heart_storm",
    emoji: "💖",
    label: "Heart Storm",
  },

  {
    key: "boom",
    emoji: "💥",
    label: "Boom!",
  },

  {
    key: "laugh",
    emoji: "😂",
    label: "Laugh",
  },

  {
    key: "boo",
    emoji: "👻",
    label: "Boo!",
  },
];


/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function displayName(
  message:
    CampfireChatMessage
) {
  return message.senderUsername
    ? `@${message.senderUsername}`
    : "Usuário";
}


function formatTime(
  dateString:
    string
) {
  const date =
    new Date(
      dateString
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  return date.toLocaleTimeString(
    "pt-BR",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  );
}


function formatDate(
  dateString:
    string
) {
  const date =
    new Date(
      dateString
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  const today =
    new Date();


  const yesterday =
    new Date();


  yesterday.setDate(
    today.getDate() -
      1
  );


  if (
    date.toDateString() ===
    today.toDateString()
  ) {
    return "Hoje";
  }


  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Ontem";
  }


  return date.toLocaleDateString(
    "pt-BR",
    {
      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",
    }
  );
}


function sameDay(
  first:
    string,

  second:
    string
) {
  const a =
    new Date(
      first
    );


  const b =
    new Date(
      second
    );


  return (
    a.toDateString() ===
    b.toDateString()
  );
}


/*
 * ============================================================
 * CONVERTER CÓDIGOS CLÁSSICOS
 * ============================================================
 */

function replaceEmoticons(
  text:
    string
) {
  const replacements:
    Array<
      [
        string,
        string
      ]
    > = [
      [
        ">:(",
        "😡",
      ],

      [
        ":'(",
        "😭",
      ],

      [
        "O:)",
        "😇",
      ],

      [
        "}:)",
        "😈",
      ],

      [
        "(fire)",
        "🔥",
      ],

      [
        "(y)",
        "👍",
      ],

      [
        "XD",
        "😂",
      ],

      [
        "xD",
        "😂",
      ],

      [
        ":D",
        "😄",
      ],

      [
        ";)",
        "😉",
      ],

      [
        ":P",
        "😛",
      ],

      [
        ":p",
        "😛",
      ],

      [
        ":O",
        "😮",
      ],

      [
        ":o",
        "😮",
      ],

      [
        "8)",
        "😎",
      ],

      [
        ":*",
        "😘",
      ],

      [
        ":)",
        "🙂",
      ],

      [
        ":(",
        "☹️",
      ],

      [
        "<3",
        "❤️",
      ],
    ];


  let result =
    text;


  for (
    const [
      code,
      emoji,
    ]
    of replacements
  ) {
    result =
      result
        .split(
          code
        )
        .join(
          emoji
        );
  }


  return result;
}


/*
 * ============================================================
 * CSS DO TEXTO
 * ============================================================
 */

function getTextStyle(
  style:
    CampfireTextStyle
): CSSProperties {
  return {
    fontFamily:
      `"${style.fontFamily}", "Segoe UI", sans-serif`,

    fontSize:
      `${style.fontSize}px`,

    color:
      style.color,

    fontWeight:
      style.bold
        ? 700
        : 400,

    fontStyle:
      style.italic
        ? "italic"
        : "normal",

    textDecoration:
      style.underline
        ? "underline"
        : "none",
  };
}


/*
 * ============================================================
 * CARREGAR PREFERÊNCIA
 * ============================================================
 */

function loadSavedStyle():
  CampfireTextStyle {
  try {
    const stored =
      localStorage.getItem(
        STYLE_STORAGE_KEY
      );


    if (
      !stored
    ) {
      return {
        ...DEFAULT_CAMPFIRE_TEXT_STYLE,
      };
    }


    return normalizeCampfireTextStyle(
      JSON.parse(
        stored
      )
    );
  } catch {
    return {
      ...DEFAULT_CAMPFIRE_TEXT_STYLE,
    };
  }
}


function formatAudioDuration(
  durationMs: number | null
): string {
  const totalSeconds = Math.max(
    0,
    Math.round((durationMs ?? 0) / 1000)
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}


function preferredRecorderMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }

  return "";
}


/*
 * ============================================================
 * COMPONENTE
 * ============================================================
 */

type Props = {
  campfireId:
    string;

  currentUserId:
    string;

  memberSystem: ReturnType<typeof useCampfireMembers>;
  voice: CampfireVoiceController;
};


function CampfireChat({
  campfireId,
  currentUserId,
  memberSystem,
  voice,
}: Props) {
  const chat =
    useCampfireChat(
      campfireId,
      true
    );


  const [chatView, setChatView] = useState<"messages" | "files" | "pins">("messages");

  const [contextTargetId, setContextTargetId] = useState<string | null>(null);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  const [moderatorTargetId, setModeratorTargetId] = useState<string | null>(null);
  const moderation = useCampfireModeration(campfireId, memberSystem.isCurrentUserOwner);
  const contextTarget = contextTargetId
    ? memberSystem.members.find((member) => member.id === contextTargetId) ?? null
    : null;
  const moderatorTarget = moderatorTargetId
    ? memberSystem.members.find((member) => member.id === moderatorTargetId) ?? null
    : null;

  function openUserContext(event: ReactMouseEvent, userId: string) {
    event.preventDefault();
    setContextTargetId(userId);
    setContextPosition({ x: event.clientX, y: event.clientY });
  }


  const [
    draft,
    setDraft,
  ] =
    useState("");


  const [
    textStyle,
    setTextStyle,
  ] =
    useState<
      CampfireTextStyle
    >(
      loadSavedStyle
    );


  const [
    localError,
    setLocalError,
  ] =
    useState("");


  const [
    recording,
    setRecording,
  ] = useState(false);


  const [
    recordingElapsedMs,
    setRecordingElapsedMs,
  ] = useState(0);


  const [
    recordedBlob,
    setRecordedBlob,
  ] = useState<Blob | null>(null);


  const [
    recordedUrl,
    setRecordedUrl,
  ] = useState("");


  const [
    recordedMimeType,
    setRecordedMimeType,
  ] = useState("audio/webm");


  const [
    recordedDurationMs,
    setRecordedDurationMs,
  ] = useState(0);


  const [
    showEmoticons,
    setShowEmoticons,
  ] =
    useState(
      false
    );


  const [
    showWinks,
    setShowWinks,
  ] =
    useState(
      false
    );


  const [
    activeWink,
    setActiveWink,
  ] =
    useState<
      CampfireChatMessage | null
    >(
      null
    );


  const messagesEndRef =
    useRef<
      HTMLDivElement | null
    >(
      null
    );


  const textareaRef =
    useRef<
      HTMLTextAreaElement | null
    >(
      null
    );


  useEffect(() => {
    const handleMention = (event: Event) => {
      const detail = (event as CustomEvent<{
        campfireId?: string;
        userId?: string;
        username?: string | null;
        displayName?: string;
      }>).detail;
      if (!detail || detail.campfireId !== campfireId || !detail.userId) return;
      const label = detail.username?.trim()
        ? `@${detail.username.trim().replace(/^@+/, "")}`
        : `@${String(detail.displayName || "CampfireUser").trim().replace(/\s+/g, "_")}`;
      setDraft((current) => {
        const spacer = current && !/\s$/.test(current) ? " " : "";
        return `${current}${spacer}${label} `.slice(0, 2000);
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener("campfire-mention-user", handleMention);
    return () => window.removeEventListener("campfire-mention-user", handleMention);
  }, [campfireId]);


  const knownWinksRef =
    useRef<
      Set<string>
    >(
      new Set()
    );


  const winkBaselineReady =
    useRef(
      false
    );


  const winkTimerRef =
    useRef<
      number | null
    >(
      null
    );


  const recorderRef =
    useRef<MediaRecorder | null>(
      null
    );


  const recorderStreamRef =
    useRef<MediaStream | null>(
      null
    );


  const recorderChunksRef =
    useRef<Blob[]>([]);


  const recordingStartedAtRef =
    useRef(0);


  const recordingTimerRef =
    useRef<number | null>(null);


  const cancelRecordingRef =
    useRef(false);


  /*
   * =========================================================
   * LEMBRAR FORMATAÇÃO
   * =========================================================
   */

  useEffect(() => {
    try {
      localStorage.setItem(
        STYLE_STORAGE_KEY,

        JSON.stringify(
          textStyle
        )
      );
    } catch {
      /*
       * Não é crítico.
       */
    }
  }, [
    textStyle,
  ]);


  /*
   * =========================================================
   * TROCAR DE SALA
   * =========================================================
   */

  useEffect(() => {
    setDraft("");

    setLocalError("");

    setShowEmoticons(
      false
    );

    setShowWinks(
      false
    );

    setActiveWink(
      null
    );

    knownWinksRef
      .current
      .clear();

    winkBaselineReady
      .current =
      false;


    if (
      winkTimerRef.current
    ) {
      window.clearTimeout(
        winkTimerRef.current
      );

      winkTimerRef.current =
        null;
    }
  }, [
    campfireId,
  ]);


  /*
   * =========================================================
   * AUTO SCROLL
   * =========================================================
   */

  useEffect(() => {
    messagesEndRef.current
      ?.scrollIntoView({
        behavior:
          "smooth",

        block:
          "end",
      });
  }, [
    chat.messages.length,
  ]);


  /*
   * =========================================================
   * DETECTAR NOVA WINK
   * =========================================================
   *
   * Winks antigas não são reproduzidas
   * ao abrir a sala.
   *
   * Apenas novas Winks recebidas/enviadas
   * executam a animação.
   * =========================================================
   */

  useEffect(() => {
    if (
      !chat.loadedOnce
    ) {
      return;
    }


    const winkMessages =
      chat.messages.filter(
        (
          message
        ) =>
          message.messageType ===
            "wink" &&
          Boolean(
            message.winkKey
          )
      );


    /*
     * Primeira carga:
     * marca tudo como conhecido.
     */

    if (
      !winkBaselineReady.current
    ) {
      for (
        const message
        of winkMessages
      ) {
        knownWinksRef
          .current
          .add(
            message.id
          );
      }

      winkBaselineReady.current =
        true;

      return;
    }


    const newWinks =
      winkMessages.filter(
        (
          message
        ) =>
          !knownWinksRef
            .current
            .has(
              message.id
            )
      );


    for (
      const message
      of winkMessages
    ) {
      knownWinksRef
        .current
        .add(
          message.id
        );
    }


    if (
      newWinks.length ===
      0
    ) {
      return;
    }


    const newest =
      newWinks[
        newWinks.length -
        1
      ];


    const { effectsMuted } =
      getUserLocalMediaPreference(
        newest.senderId
      );


    if (effectsMuted) {
      return;
    }


    setActiveWink(
      newest
    );


    if (
      winkTimerRef.current
    ) {
      window.clearTimeout(
        winkTimerRef.current
      );
    }


    winkTimerRef.current =
      window.setTimeout(
        () => {
          setActiveWink(
            null
          );

          winkTimerRef.current =
            null;
        },
        3500
      );
  }, [
    chat.loadedOnce,
    chat.messages,
  ]);


  /*
   * =========================================================
   * MENSAGEM DE ÁUDIO — WLM STYLE
   * =========================================================
   */

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(
        recordingTimerRef.current
      );

      recordingTimerRef.current = null;
    }
  }


  function stopRecorderStream() {
    recorderStreamRef.current
      ?.getTracks()
      .forEach(
        (track) => track.stop()
      );

    recorderStreamRef.current = null;
  }


  function clearRecordedPreview() {
    setRecordedBlob(null);
    setRecordedUrl("");
    setRecordedDurationMs(0);
    setRecordingElapsedMs(0);
  }


  useEffect(() => {
    if (!recordedUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(
        recordedUrl
      );
    };
  }, [
    recordedUrl,
  ]);


  useEffect(() => {
    return () => {
      cancelRecordingRef.current = true;
      clearRecordingTimer();

      const recorder =
        recorderRef.current;

      if (
        recorder &&
        recorder.state !== "inactive"
      ) {
        try {
          recorder.stop();
        } catch {
          // best effort
        }
      }

      stopRecorderStream();
    };
  }, []);


  async function startAudioRecording() {
    if (
      recording ||
      chat.sending
    ) {
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setLocalError(
        "Este sistema não disponibilizou gravação de áudio."
      );

      return;
    }

    setLocalError("");
    clearRecordedPreview();

    try {
      const mediaSettings =
        loadCampfireMediaSettings();

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: audioInputConstraint(
            mediaSettings.audioInputId
          ),
          video: false,
        });

      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      cancelRecordingRef.current = false;

      const preferredMime =
        preferredRecorderMimeType();

      const recorder = preferredMime
        ? new MediaRecorder(
            stream,
            { mimeType: preferredMime }
          )
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable =
        (event) => {
          if (event.data.size > 0) {
            recorderChunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onerror = () => {
        setLocalError(
          "A gravação de áudio foi interrompida."
        );
      };

      recorder.onstop = () => {
        clearRecordingTimer();
        setRecording(false);
        stopRecorderStream();

        const duration = Math.min(
          120000,
          Math.max(
            0,
            Date.now() -
              recordingStartedAtRef.current
          )
        );

        if (cancelRecordingRef.current) {
          recorderChunksRef.current = [];
          clearRecordedPreview();
          return;
        }

        const mimeType =
          recorder.mimeType ||
          preferredMime ||
          "audio/webm";

        const blob = new Blob(
          recorderChunksRef.current,
          { type: mimeType }
        );

        recorderChunksRef.current = [];

        if (blob.size < 1) {
          setLocalError(
            "A gravação não produziu áudio."
          );

          return;
        }

        setRecordedBlob(blob);
        setRecordedMimeType(mimeType);
        setRecordedDurationMs(duration);
        setRecordingElapsedMs(duration);
        setRecordedUrl(
          URL.createObjectURL(blob)
        );
      };

      recordingStartedAtRef.current =
        Date.now();

      setRecordingElapsedMs(0);
      setRecording(true);

      recorder.start(250);

      recordingTimerRef.current =
        window.setInterval(
          () => {
            const elapsed =
              Date.now() -
              recordingStartedAtRef.current;

            setRecordingElapsedMs(
              Math.min(120000, elapsed)
            );

            if (elapsed >= 120000) {
              const current =
                recorderRef.current;

              if (
                current &&
                current.state !== "inactive"
              ) {
                current.stop();
              }
            }
          },
          100
        );
    } catch (recordError) {
      stopRecorderStream();
      setRecording(false);

      if (
        recordError instanceof DOMException &&
        recordError.name === "NotAllowedError"
      ) {
        setLocalError(
          "Permissão de microfone negada."
        );

        return;
      }

      setLocalError(
        recordError instanceof Error
          ? recordError.message
          : "Não foi possível iniciar o microfone."
      );
    }
  }


  function stopAudioRecording() {
    const recorder =
      recorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      recorder.stop();
    }
  }


  function cancelAudioRecording() {
    cancelRecordingRef.current = true;

    const recorder =
      recorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      recorder.stop();
      return;
    }

    clearRecordedPreview();
  }


  async function sendRecordedAudio() {
    if (
      !recordedBlob ||
      chat.sending
    ) {
      return;
    }

    setLocalError("");

    const result =
      await chat.sendAudioMessage(
        recordedBlob,
        recordedDurationMs,
        recordedMimeType
      );

    if (result.ok) {
      clearRecordedPreview();
      return;
    }

    setLocalError(
      result.message
    );
  }


  /*
   * =========================================================
   * ENVIAR TEXTO
   * =========================================================
   */

  async function send() {
    if (
      chat.sending
    ) {
      return;
    }


    const clean =
      draft.trim();


    if (
      !clean
    ) {
      return;
    }


    setLocalError("");


    const result =
      await chat.sendMessage(
        clean,
        textStyle
      );


    if (
      result.ok
    ) {
      setDraft("");

      return;
    }


    setLocalError(
      result.message
    );
  }


  /*
   * =========================================================
   * INSERIR EMOTICON NA POSIÇÃO DO CURSOR
   * =========================================================
   */

  function insertEmoji(
    emoji:
      string
  ) {
    const textarea =
      textareaRef.current;


    if (
      !textarea
    ) {
      setDraft(
        (
          current
        ) =>
          (
            current +
            emoji
          ).slice(
            0,
            2000
          )
      );

      return;
    }


    const start =
      textarea.selectionStart ??
      draft.length;


    const end =
      textarea.selectionEnd ??
      start;


    const next =
      (
        draft.slice(
          0,
          start
        ) +
        emoji +
        draft.slice(
          end
        )
      ).slice(
        0,
        2000
      );


    setDraft(
      next
    );


    setShowEmoticons(
      false
    );


    requestAnimationFrame(
      () => {
        const newPosition =
          Math.min(
            start +
              emoji.length,

            next.length
          );


        textarea.focus();


        textarea.setSelectionRange(
          newPosition,
          newPosition
        );
      }
    );
  }


  /*
   * =========================================================
   * ENVIAR WINK
   * =========================================================
   */

  async function sendWink(
    winkKey:
      string
  ) {
    setShowWinks(
      false
    );

    setShowEmoticons(
      false
    );

    setLocalError("");


    const result =
      await chat.sendWink(
        winkKey
      );


    if (
      !result.ok
    ) {
      setLocalError(
        result.message
      );
    }
  }


  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="campfireChat">

      {/* ====================================================
          STATUS
          ==================================================== */}

      <div className="campfireChatStatus">
        <div className="campfireChatTopTabs" role="tablist" aria-label="Conversa">
          <button type="button" role="tab" aria-selected={chatView === "messages"} className={chatView === "messages" ? "active" : ""} onClick={() => setChatView("messages")}>💬 Mensagens</button>
          <button type="button" role="tab" aria-selected={chatView === "files"} className={chatView === "files" ? "active" : ""} onClick={() => setChatView("files")}>▧ Arquivos</button>
          <button type="button" role="tab" aria-selected={chatView === "pins"} className={chatView === "pins" ? "active" : ""} onClick={() => setChatView("pins")}>⌖ Fixados</button>
        </div>

        <span className={chat.realtimeConnected ? "chatRealtime online" : "chatRealtime reconnecting"}>
          <i />
          {chat.realtimeConnected ? "Realtime" : "Reconectando"}
        </span>
      </div>


      {/* ====================================================
          MENSAGENS
          ==================================================== */}

      <div className="campfireMessages">

        {chatView === "files" && (
          <div className="campfireChatAuxView">
            <div className="campfireChatWelcomeIcon">▧</div>
            <strong>Arquivos da Campfire</strong>
            <small>{chat.messages.filter((item) => Boolean(item.mediaUrl)).length > 0 ? "Os arquivos enviados aparecem na conversa." : "Ainda não há arquivos compartilhados nesta Campfire."}</small>
          </div>
        )}

        {chatView === "pins" && (
          <div className="campfireChatAuxView">
            <div className="campfireChatWelcomeIcon">⌖</div>
            <strong>Mensagens fixadas</strong>
            <small>Nenhuma mensagem foi fixada ainda.</small>
          </div>
        )}

        {chatView === "messages" && chat.loading && (
          <div className="chatCenterMessage">
            🔥 Carregando mensagens...
          </div>
        )}


        {chatView === "messages" && !chat.loading && chat.messages.length === 0 && (
          <div className="campfireChatWelcome">
            <div className="campfireChatWelcomeIcon">#</div>
            <h2>A conversa começa aqui.</h2>
            <p>Esta é a primeira página da conversa desta Campfire.</p>
            <div className="campfireChatWelcomeGrid">
              <div><span>💬</span><small>Converse com toda a Campfire</small></div>
              <div><span>🖼</span><small>Compartilhe imagens e GIFs</small></div>
              <div><span>🔗</span><small>Envie links e descobertas</small></div>
              <div><span>🎤</span><small>Grave mensagens de áudio</small></div>
            </div>
            <strong className="campfireChatWelcomeCta">Seja o primeiro a quebrar o gelo.</strong>
          </div>
        )}


        {chatView === "messages" && !chat.loading &&
          chat.messages.map(
            (
              message,
              index
            ) => {
              const mine =
                message.senderId ===
                currentUserId;


              const previous =
                index >
                0
                  ? chat.messages[
                      index -
                      1
                    ]
                  : null;


              const showDate =
                !previous ||
                !sameDay(
                  previous.createdAt,
                  message.createdAt
                );


              const name =
                displayName(
                  message
                );


              const letter =
                (
                  message.senderUsername ||
                  "U"
                )
                  .charAt(0)
                  .toUpperCase();


              const wink =
                WINKS.find(
                  (
                    item
                  ) =>
                    item.key ===
                    message.winkKey
                );


              /*
               * ---------------------------------------------
               * WINK
               * ---------------------------------------------
               */

              if (
                message.messageType ===
                "wink"
              ) {
                return (
                  <div
                    key={
                      message.id
                    }
                  >
                    {showDate && (
                      <div className="chatDateDivider">
                        <span>
                          {formatDate(
                            message.createdAt
                          )}
                        </span>
                      </div>
                    )}

                    <div
                      className="chatEventMessage"
                      onContextMenu={(event) => openUserContext(event, message.senderId)}
                    >
                      <span>
                        {wink?.emoji ??
                          "🎉"}
                      </span>

                      <div>
                        <strong>
                          {mine
                            ? "Você"
                            : name}
                        </strong>

                        {" enviou uma Wink"}

                        {wink && (
                          <>
                            {" — "}
                            {
                              wink.label
                            }
                          </>
                        )}

                        <time>
                          {formatTime(
                            message.createdAt
                          )}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              }


              /*
               * ---------------------------------------------
               * AUDIO
               * ---------------------------------------------
               */

              if (
                message.messageType ===
                "audio"
              ) {
                return (
                  <div
                    key={
                      message.id
                    }
                  >
                    {showDate && (
                      <div className="chatDateDivider">
                        <span>
                          {formatDate(
                            message.createdAt
                          )}
                        </span>
                      </div>
                    )}

                    <div
                      className={
                        mine
                          ? "chatAudioMessage mine"
                          : "chatAudioMessage"
                      }
                      onContextMenu={(event) => openUserContext(event, message.senderId)}
                    >
                      <div className="chatAudioMessageHeader">
                        <span>🎤</span>

                        <strong>
                          {mine
                            ? "Você"
                            : name}
                        </strong>

                        <small>
                          {formatAudioDuration(
                            message.mediaDurationMs
                          )}
                        </small>

                        <time>
                          {formatTime(
                            message.createdAt
                          )}
                        </time>
                      </div>

                      {message.mediaUrl ? (
                        <audio
                          controls
                          preload="metadata"
                          src={message.mediaUrl}
                        />
                      ) : (
                        <div className="chatAudioUnavailable">
                          Áudio indisponível ou ainda carregando.
                        </div>
                      )}
                    </div>
                  </div>
                );
              }


              /*
               * ---------------------------------------------
               * SYSTEM
               * ---------------------------------------------
               */

              if (
                message.messageType ===
                "system"
              ) {
                return (
                  <div
                    className="chatSystemMessage"
                    key={
                      message.id
                    }
                  >
                    {
                      message.content
                    }
                  </div>
                );
              }


              /*
               * ---------------------------------------------
               * TEXT
               * ---------------------------------------------
               */

              return (
                <div
                  key={
                    message.id
                  }
                >

                  {showDate && (
                    <div className="chatDateDivider">
                      <span>
                        {formatDate(
                          message.createdAt
                        )}
                      </span>
                    </div>
                  )}


                  <div
                    className={
                      mine
                        ? "chatMessageRow mine"
                        : "chatMessageRow"
                    }
                    onContextMenu={(event) => openUserContext(event, message.senderId)}
                  >

                    {!mine && (
                      <>
                        {message.senderAvatarUrl ? (
                          <div
                            className="chatAvatar"
                            style={{
                              backgroundImage:
                                `url("${message.senderAvatarUrl}")`,
                            }}
                          />
                        ) : (
                          <div className="chatAvatar fallback">
                            {letter}
                          </div>
                        )}
                      </>
                    )}


                    <div className="chatMessageBlock">

                      <div className="chatMessageMeta">

                        <strong>
                          {mine
                            ? "Você"
                            : name}
                        </strong>


                        {!mine &&
                          message.senderUsername && (
                            <small>
                              @
                              {
                                message.senderUsername
                              }
                            </small>
                          )}


                        <time>
                          {formatTime(
                            message.createdAt
                          )}
                        </time>

                      </div>


                      <div
                        className="chatBubble"
                        style={
                          getTextStyle(
                            message.textStyle
                          )
                        }
                      >
                        {replaceEmoticons(
                          message.content
                        )}
                      </div>

                    </div>

                  </div>

                </div>
              );
            }
          )}


        <div
          ref={
            messagesEndRef
          }
        />

      </div>


      {/* ====================================================
          WINK EM TELA CHEIA DA CONVERSA
          ==================================================== */}

      {activeWink && (
        <WinkOverlay
          message={
            activeWink
          }
          currentUserId={
            currentUserId
          }
        />
      )}


      {/* ====================================================
          ERRO
          ==================================================== */}

      {(chat.error ||
        localError) && (
        <div className="chatError">
          {localError ||
            chat.error}
        </div>
      )}


      {/* ====================================================
          COMPOSITOR
          ==================================================== */}

      {chatView === "messages" && (
      <div className="campfireComposer">

        {/* ==================================================
            BARRA DE FORMATAÇÃO
            ================================================== */}

        <div className="chatFormattingToolbar">

          {/* FONT */}

          <select
            className="chatFontSelect"
            title="Fonte"
            value={
              textStyle.fontFamily
            }
            style={{
              fontFamily:
                `"${textStyle.fontFamily}", sans-serif`,
            }}
            onChange={(
              event
            ) => {
              setTextStyle(
                (
                  current
                ) => ({
                  ...current,

                  fontFamily:
                    event.target
                      .value,
                })
              );
            }}
          >

            {CAMPFIRE_FONT_FAMILIES.map(
              (
                font
              ) => (
                <option
                  value={
                    font
                  }
                  key={
                    font
                  }
                  style={{
                    fontFamily:
                      `"${font}"`,
                  }}
                >
                  {font}
                </option>
              )
            )}

          </select>


          {/* SIZE */}

          <select
            className="chatSizeSelect"
            title="Tamanho da fonte"
            value={
              textStyle.fontSize
            }
            onChange={(
              event
            ) => {
              const size =
                Number(
                  event.target
                    .value
                );


              setTextStyle(
                (
                  current
                ) => ({
                  ...current,

                  fontSize:
                    size,
                })
              );
            }}
          >

            {CAMPFIRE_FONT_SIZES.map(
              (
                size
              ) => (
                <option
                  key={
                    size
                  }
                  value={
                    size
                  }
                >
                  {size}
                </option>
              )
            )}

          </select>


          <div className="toolbarDivider" />


          {/* COLOR */}

          <label
            className="chatColorTool"
            title="Cor da fonte"
          >
            <span
              style={{
                color:
                  textStyle.color,
              }}
            >
              A
            </span>

            <input
              type="color"
              value={
                textStyle.color
              }
              onChange={(
                event
              ) => {
                setTextStyle(
                  (
                    current
                  ) => ({
                    ...current,

                    color:
                      event.target
                        .value,
                  })
                );
              }}
            />
          </label>


          {/* B */}

          <button
            className={
              textStyle.bold
                ? "formatButton active"
                : "formatButton"
            }
            title="Negrito"
            onClick={() => {
              setTextStyle(
                (
                  current
                ) => ({
                  ...current,

                  bold:
                    !current.bold,
                })
              );
            }}
          >
            <strong>
              B
            </strong>
          </button>


          {/* I */}

          <button
            className={
              textStyle.italic
                ? "formatButton active"
                : "formatButton"
            }
            title="Itálico"
            onClick={() => {
              setTextStyle(
                (
                  current
                ) => ({
                  ...current,

                  italic:
                    !current.italic,
                })
              );
            }}
          >
            <em>
              I
            </em>
          </button>


          {/* U */}

          <button
            className={
              textStyle.underline
                ? "formatButton active"
                : "formatButton"
            }
            title="Sublinhado"
            onClick={() => {
              setTextStyle(
                (
                  current
                ) => ({
                  ...current,

                  underline:
                    !current.underline,
                })
              );
            }}
          >
            <u>
              U
            </u>
          </button>


          <div className="toolbarDivider" />


          {/* EMOTICONS */}

          <div className="chatToolMenuWrapper">

            <button
              className={
                showEmoticons
                  ? "formatButton active"
                  : "formatButton"
              }
              title="Emoticons"
              onClick={() => {
                setShowEmoticons(
                  (
                    current
                  ) =>
                    !current
                );

                setShowWinks(
                  false
                );
              }}
            >
              😀
            </button>


            {showEmoticons && (
              <div className="emoticonPicker">

                <div className="pickerTitle">
                  Emoticons
                </div>

                <div className="emoticonGrid">

                  {EMOTICONS.map(
                    (
                      emoticon
                    ) => (
                      <button
                        key={
                          emoticon.code
                        }
                        title={
                          `${emoticon.label}  ${emoticon.code}`
                        }
                        onClick={() =>
                          insertEmoji(
                            emoticon.emoji
                          )
                        }
                      >
                        <span>
                          {
                            emoticon.emoji
                          }
                        </span>

                        <small>
                          {
                            emoticon.code
                          }
                        </small>
                      </button>
                    )
                  )}

                </div>

                <div className="pickerHint">
                  Você também pode
                  digitar códigos como
                  {" "}
                  <strong>
                    :)
                  </strong>
                  ,
                  {" "}
                  <strong>
                    :D
                  </strong>
                  {" "}
                  ou
                  {" "}
                  <strong>
                    &lt;3
                  </strong>
                  .
                </div>

              </div>
            )}

          </div>


          {/* WINKS */}

          <div className="chatToolMenuWrapper">

            <button
              className={
                showWinks
                  ? "formatButton active"
                  : "formatButton"
              }
              title="Winks"
              disabled={
                chat.sending
              }
              onClick={() => {
                setShowWinks(
                  (
                    current
                  ) =>
                    !current
                );

                setShowEmoticons(
                  false
                );
              }}
            >
              🎉
            </button>


            {showWinks && (
              <div className="winkPicker">

                <div className="pickerTitle">
                  Winks
                </div>

                <div className="winkGrid">

                  {WINKS.map(
                    (
                      wink
                    ) => (
                      <button
                        key={
                          wink.key
                        }
                        onClick={() =>
                          void sendWink(
                            wink.key
                          )
                        }
                      >
                        <span>
                          {
                            wink.emoji
                          }
                        </span>

                        <small>
                          {
                            wink.label
                          }
                        </small>
                      </button>
                    )
                  )}

                </div>

                <div className="pickerHint">
                  Winks tomam conta
                  temporariamente da
                  janela da conversa.
                </div>

              </div>
            )}

          </div>


          {/* AUDIO */}

          <button
            type="button"
            className={
              recording
                ? "formatButton audioRecordButton active"
                : "formatButton audioRecordButton"
            }
            title={
              recording
                ? "Parar gravação"
                : "Gravar mensagem de áudio"
            }
            disabled={chat.sending}
            onClick={() =>
              recording
                ? stopAudioRecording()
                : void startAudioRecording()
            }
          >
            {recording ? "⏹" : "🎤"}
          </button>

        </div>


        {(recording || recordedBlob) && (
          <div className="chatAudioComposer">
            {recording ? (
              <>
                <div className="chatAudioRecordingState">
                  <span className="chatAudioRecordingDot" />

                  <strong>Gravando áudio</strong>

                  <time>
                    {formatAudioDuration(
                      recordingElapsedMs
                    )}
                  </time>
                </div>

                <div className="chatAudioComposerActions">
                  <button
                    type="button"
                    className="cancel"
                    onClick={cancelAudioRecording}
                  >
                    ✕ Cancelar
                  </button>

                  <button
                    type="button"
                    className="stop"
                    onClick={stopAudioRecording}
                  >
                    ⏹ Parar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="chatAudioPreview">
                  <span>🎤</span>

                  <audio
                    controls
                    preload="metadata"
                    src={recordedUrl}
                  />

                  <small>
                    {formatAudioDuration(
                      recordedDurationMs
                    )}
                  </small>
                </div>

                <div className="chatAudioComposerActions">
                  <button
                    type="button"
                    className="cancel"
                    disabled={chat.sending}
                    onClick={clearRecordedPreview}
                  >
                    Descartar
                  </button>

                  <button
                    type="button"
                    className="send"
                    disabled={chat.sending}
                    onClick={() =>
                      void sendRecordedAudio()
                    }
                  >
                    {chat.sending
                      ? "Enviando..."
                      : "➤ Enviar áudio"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}


        {/* ==================================================
            TEXTAREA
            ================================================== */}

        <textarea
          ref={
            textareaRef
          }
          value={
            draft
          }
          maxLength={
            2000
          }
          rows={
            2
          }
          placeholder="Escreva uma mensagem..."
          style={
            getTextStyle(
              textStyle
            )
          }
          onChange={(
            event
          ) => {
            setDraft(
              event.target
                .value
            );

            setLocalError(
              ""
            );
          }}
          onKeyDown={(
            event
          ) => {
            if (
              event.key ===
                "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();

              void send();
            }
          }}
        />


        {/* ==================================================
            FOOTER
            ================================================== */}

        <div className="composerBottom">

          <div className="composerInfo">

            <small>
              {draft.length}
              /2000
            </small>

            <small
              className="composerStylePreview"
              style={
                getTextStyle(
                  textStyle
                )
              }
            >
              Aa
            </small>

          </div>


          <button
            disabled={
              !draft.trim() ||
              chat.sending
            }
            onClick={() =>
              void send()
            }
          >
            {chat.sending
              ? "Enviando..."
              : "Enviar"}
          </button>

        </div>

      </div>
      )}

      <UserContextMenu
        open={contextTarget !== null}
        position={contextPosition}
        campfireId={campfireId}
        currentUserId={currentUserId}
        target={contextTarget}
        isCurrentUserOwner={memberSystem.isCurrentUserOwner}
        voice={voice}
        moderation={moderation}
        onClose={() => setContextTargetId(null)}
        onModeratorView={(userId) => { setModeratorTargetId(userId); setContextTargetId(null); }}
        onTransferOwnership={(userId) => memberSystem.transferOwnership(userId)}
      />

      <CampfireModeratorView
        open={moderatorTarget !== null && memberSystem.isCurrentUserOwner}
        target={moderatorTarget}
        moderation={moderation}
        onClose={() => setModeratorTargetId(null)}
      />

    </div>
  );
}


/*
 * ============================================================
 * WINK OVERLAY
 * ============================================================
 */

function WinkOverlay({
  message,
  currentUserId,
}: {
  message:
    CampfireChatMessage;

  currentUserId:
    string;
}) {
  const wink =
    WINKS.find(
      (
        item
      ) =>
        item.key ===
        message.winkKey
    ) ??
    WINKS[0];


  const sender =
    message.senderId ===
    currentUserId
      ? "Você"
      : displayName(
          message
        );


  const particles =
    wink.key ===
      "heart_storm"
      ? [
          "❤️",
          "💖",
          "💕",
          "💗",
          "❤️",
          "💞",
          "💖",
          "💕",
        ]

      : wink.key ===
          "fireworks"
        ? [
            "✨",
            "🎆",
            "🎇",
            "✨",
            "⭐",
            "🎆",
            "✨",
            "🎇",
          ]

        : wink.key ===
            "laugh"
          ? [
              "😂",
              "🤣",
              "😆",
              "😂",
              "🤣",
              "😆",
              "😂",
              "🤣",
            ]

          : wink.key ===
              "boo"
            ? [
                "👻",
                "✨",
                "🌙",
                "👻",
                "✨",
                "👻",
                "🌙",
                "✨",
              ]

            : wink.key ===
                "boom"
              ? [
                  "💥",
                  "🔥",
                  "✨",
                  "💥",
                  "🔥",
                  "✨",
                  "💥",
                  "🔥",
                ]

              : [
                  "🔥",
                  "🔥",
                  "✨",
                  "🔥",
                  "✨",
                  "🔥",
                  "🔥",
                  "✨",
                ];


  return (
    <div
      className={
        `winkOverlay wink-${wink.key}`
      }
    >
      <div className="winkStage">

        <div className="winkPrimary">
          {
            wink.emoji
          }
        </div>


        <div className="winkParticles">

          {particles.map(
            (
              particle,
              index
            ) => (
              <span
                key={
                  index
                }
              >
                {
                  particle
                }
              </span>
            )
          )}

        </div>


        <div className="winkCaption">
          <strong>
            {sender}
          </strong>

          <span>
            {
              wink.label
            }
          </span>
        </div>

      </div>
    </div>
  );
}


export default CampfireChat;