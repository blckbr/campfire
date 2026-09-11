import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  supabase,
} from "./lib/supabase";

import type {
  CampfireProfile,
} from "./ProfileSetup";

import FriendsModal, {
  type FriendsModalTab,
} from "./FriendsModal";

import CampfireSettingsModal
  from "./CampfireSettingsModal";

import {
  useFriendships,
} from "./useFriendships";

import type {
  PublicProfile,
} from "./useFriendships";

import {
  useCampfires,
} from "./useCampfires";

import type {
  CampfireItem,
  CampfirePrivacy,
  CampfireLifecycleType,
} from "./useCampfires";

import CampfireChat
  from "./CampfireChat";

import CampfireCoverPicker
  from "./CampfireCoverPicker";

import {
  getCampfireCoverPreset,
  resolveCampfireCoverUrl,
  type CampfireCoverSelection,
} from "./campfireCovers";

import CampfireScreenShare
  from "./CampfireScreenShare";

import AnimeBrowser
  from "./AnimeBrowser";

import CampfireMembersPanel
  from "./CampfireMembersPanel";

import CampfireRightRail
  from "./CampfireRightRail";

import CampfireExpiryCountdown
  from "./CampfireExpiryCountdown";

import CampfireNewsImage
  from "./components/CampfireNewsImage";

import {
  useCampfireRoomEvents,
} from "./useCampfireRoomEvents";

import {
  useCampfireMembers,
} from "./useCampfireMembers";

import {
  useCampfireVoice,
} from "./useCampfireVoice";


import CampfireDirectMessageModal
  from "./CampfireDirectMessageModal";

import CampfireDirectCallOverlay
  from "./CampfireDirectCallOverlay";

import CampfireVerificationModal
  from "./CampfireVerificationModal";

import CampfireUserProfileModal
  from "./CampfireUserProfileModal";

import {
  useCampfireDirectCall,
} from "./useCampfireDirectCall";

import {
  ensureCampfireIdentity,
} from "./campfireIdentity";

import {
  setCampfireNativeOverlayBlock,
} from "./campfireNativeOverlay";

import {
  CAMPFIRE_LAYOUT_RESET_EVENT,
} from "./campfireAppPreferences";

import {
  askCampfireAssistant,
  getCampfireNews,
  openCampfireWorkspaceWindow,
  openUrl,
  type CampfireAssistantReply,
  type CampfireNewsItem,
} from "./desktop";

import "./App.css";
import "./CampfireTabs.css";
import "./CampfireR6Shell.css";
import campfireIcon from "./assets/campfire-icon.png";


type Props = {
  profile:
    CampfireProfile;
};


type CampfireRoomTab =
  | "stage"
  | "messages"
  | "screen"
  | "anime";

type SidebarContextRequest = {
  campfireId: string;
  userId: string;
  x: number;
  y: number;
  nonce: number;
};

const CAMPFIRE_NEWS_REFRESH_MS = 5 * 60 * 1000;

function formatNewsClock(date: Date | null) {
  if (!date) return "Aguardando atualização";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatNewsTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const NEWS_FALLBACK_PRESETS = [
  "cinema-popcorn",
  "music-vinyl",
  "gaming-desk",
  "neon-city",
  "fantasy-moon",
  "marshmallow",
];

function resolveNewsFallbackUrl(index: number) {
  return getCampfireCoverPreset(
    NEWS_FALLBACK_PRESETS[index % NEWS_FALLBACK_PRESETS.length]
  ).url;
}

const LEFT_RAIL_DEFAULT = 288;
const RIGHT_RAIL_DEFAULT = 320;
const LEFT_RAIL_MIN_RATIO = 0.75;
const RIGHT_RAIL_MIN_RATIO = 0.75;
const LEFT_RAIL_MIN = 216;
const RIGHT_RAIL_MIN = 240;

type RailSide = "left" | "right";

function clampRailWidth(side: RailSide, value: number): number {
  const max = side === "left" ? LEFT_RAIL_DEFAULT : RIGHT_RAIL_DEFAULT;
  const minRatio = side === "left" ? LEFT_RAIL_MIN_RATIO : RIGHT_RAIL_MIN_RATIO;
  const hardMin = side === "left" ? LEFT_RAIL_MIN : RIGHT_RAIL_MIN;
  const min = Math.max(hardMin, Math.round(max * minRatio));
  return Math.max(min, Math.min(max, Math.round(value)));
}

function loadRailWidth(side: RailSide): number {
  const fallback = side === "left" ? LEFT_RAIL_DEFAULT : RIGHT_RAIL_DEFAULT;
  try {
    const raw = localStorage.getItem(`campfire.layout.${side}RailWidth`);
    const parsed = raw ? Number(raw) : fallback;
    return Number.isFinite(parsed) ? clampRailWidth(side, parsed) : fallback;
  } catch {
    return fallback;
  }
}


function profileName(
  profile:
    PublicProfile
) {
  return profile.username
    ? `@${profile.username}`
    : "Usuário";
}


function statusClass(
  status:
    string
) {
  if (
    status ===
    "offline"
  ) {
    return "offline";
  }


  if (
    status ===
    "away" ||
    status ===
    "busy"
  ) {
    return "away";
  }


  return "online";
}


function statusText(
  status:
    string
) {
  if (
    status ===
    "offline"
  ) {
    return "Offline";
  }


  if (
    status ===
    "away"
  ) {
    return "Ausente";
  }


  if (
    status ===
    "busy"
  ) {
    return "Ocupado";
  }


  return "Online";
}


function privacyText(
  privacy:
    CampfirePrivacy
) {
  if (
    privacy ===
    "friends"
  ) {
    return "Friends";
  }


  if (
    privacy ===
    "link"
  ) {
    return "Invite Link";
  }


  return "Private";
}


function CampfireStageVideo({
  stream,
  label,
  className,
}: {
  stream: MediaStream;
  label: string;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      aria-label={label}
      autoPlay
      muted
      playsInline
    />
  );
}

/* ============================================================
   HOME
   ============================================================ */

function CampfireHome({
  profile,
}: Props) {
  const detachedParams = new URLSearchParams(window.location.search);
  const detachedKindParam = detachedParams.get("campfirePopout");
  const detachedWorkspaceKind: Exclude<CampfireRoomTab, "stage"> | null =
    detachedKindParam === "messages" || detachedKindParam === "anime" || detachedKindParam === "screen"
      ? detachedKindParam
      : null;
  const detachedCampfireId = detachedWorkspaceKind
    ? detachedParams.get("campfireId")
    : null;

  const [leftRailWidth, setLeftRailWidth] = useState(() => loadRailWidth("left"));
  const [rightRailWidth, setRightRailWidth] = useState(() => loadRailWidth("right"));
  const railResizeRef = useRef<{ side: RailSide; startX: number; startWidth: number } | null>(null);

  function beginRailResize(side: RailSide, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    railResizeRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? leftRailWidth : rightRailWidth,
    };

    const onMove = (moveEvent: MouseEvent) => {
      const state = railResizeRef.current;
      if (!state) return;
      const delta = moveEvent.clientX - state.startX;
      const next = state.side === "left"
        ? state.startWidth + delta
        : state.startWidth - delta;
      const clamped = clampRailWidth(state.side, next);
      if (state.side === "left") setLeftRailWidth(clamped);
      else setRightRailWidth(clamped);
    };

    const onUp = () => {
      railResizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    try {
      localStorage.setItem("campfire.layout.leftRailWidth", String(leftRailWidth));
      localStorage.setItem("campfire.layout.rightRailWidth", String(rightRailWidth));
    } catch {
      // Ignore storage restrictions.
    }
  }, [leftRailWidth, rightRailWidth]);

  useEffect(() => {
    const reset = () => {
      setLeftRailWidth(LEFT_RAIL_DEFAULT);
      setRightRailWidth(RIGHT_RAIL_DEFAULT);
    };
    window.addEventListener(CAMPFIRE_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(CAMPFIRE_LAYOUT_RESET_EVENT, reset);
  }, []);

  const [
    liveProfileStatus,
    setLiveProfileStatus,
  ] = useState(
    profile.status
  );


  const [
    livePersonalMessage,
    setLivePersonalMessage,
  ] = useState(() => {
    try {
      return (
        localStorage.getItem(
          `campfire.presence.personalMessage.${profile.id}`
        ) ?? ""
      ).slice(0, 120);
    } catch {
      return "";
    }
  });

  const [campfireAiPrompt, setCampfireAiPrompt] = useState("");
  const [campfireAiResult, setCampfireAiResult] = useState<CampfireAssistantReply | null>(null);
  const [campfireAiLoading, setCampfireAiLoading] = useState(false);
  const [campfireAiError, setCampfireAiError] = useState("");
  const [campfireNews, setCampfireNews] = useState<CampfireNewsItem[]>([]);
  const [campfireNewsLoading, setCampfireNewsLoading] = useState(true);
  const [campfireNewsError, setCampfireNewsError] = useState("");
  const [campfireNewsUpdatedAt, setCampfireNewsUpdatedAt] = useState<Date | null>(null);

  async function runCampfireAiQuery() {
    const query = campfireAiPrompt.trim();
    if (!query || campfireAiLoading) return;
    setCampfireAiLoading(true);
    setCampfireAiError("");
    try {
      const reply = await askCampfireAssistant(query);
      setCampfireAiResult(reply);
    } catch (error) {
      setCampfireAiError(error instanceof Error ? error.message : "Não foi possível concluir a pesquisa agora.");
    } finally {
      setCampfireAiLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      setCampfireNewsLoading(true);
      try {
        const items = await getCampfireNews();
        if (cancelled) return;
        setCampfireNews(items);
        setCampfireNewsError("");
        setCampfireNewsUpdatedAt(new Date());
      } catch (error) {
        if (cancelled) return;
        setCampfireNewsError(error instanceof Error ? error.message : "Não foi possível atualizar as notícias agora.");
      } finally {
        if (!cancelled) setCampfireNewsLoading(false);
      }
    };

    void loadNews();
    const intervalId = window.setInterval(() => {
      void loadNews();
    }, CAMPFIRE_NEWS_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setLiveProfileStatus(
      profile.status
    );
  }, [
    profile.id,
    profile.status,
  ]);


  useEffect(() => {
    function handlePresenceChange(
      event: Event
    ) {
      const detail = (
        event as CustomEvent<{
          status?: string;
          personalMessage?: string;
        }>
      ).detail;

      if (
        typeof detail?.status ===
        "string"
      ) {
        setLiveProfileStatus(
          detail.status
        );
      }

      if (
        typeof detail?.personalMessage ===
        "string"
      ) {
        setLivePersonalMessage(
          detail.personalMessage.slice(
            0,
            120
          )
        );
      }
    }

    window.addEventListener(
      "campfire-profile-presence-change",
      handlePresenceChange
    );

    return () => {
      window.removeEventListener(
        "campfire-profile-presence-change",
        handlePresenceChange
      );
    };
  }, []);


  /*
   * =========================================================
   * FRIENDS
   * =========================================================
   */

  const friendSystem =
    useFriendships(
      profile.id
    );


  const [
    showFriendsModal,
    setShowFriendsModal,
  ] =
    useState(
      false
    );


  const [
    friendsModalTab,
    setFriendsModalTab,
  ] =
    useState<FriendsModalTab>(
      "add"
    );


  const [
    showSettings,
    setShowSettings,
  ] = useState(false);

  const [
    showUnifiedMenu,
    setShowUnifiedMenu,
  ] = useState(false);

  const [
    activeAppMenu,
    setActiveAppMenu,
  ] = useState<
    "file" |
    "contacts" |
    "actions" |
    "tools" |
    "help" |
    null
  >(null);

  const [
    infoModal,
    setInfoModal,
  ] = useState<
    "about" |
    null
  >(null);

  const menuBarRef =
    useRef<HTMLElement | null>(
      null
    );

  const menuEscapeReturnRef = useRef<"help" | "unified" | null>(null);

  function openAboutFromMenu(source: "help" | "unified" | null) {
    menuEscapeReturnRef.current = source;
    setInfoModal("about");
    setActiveAppMenu(null);
    setShowUnifiedMenu(false);
  }

  function handleCampfireMenuEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return false;

    if (infoModal) {
      const previous = menuEscapeReturnRef.current;
      menuEscapeReturnRef.current = null;
      setInfoModal(null);
      if (previous === "help") setActiveAppMenu("help");
      if (previous === "unified") setShowUnifiedMenu(true);
      return true;
    }

    if (activeAppMenu) {
      setActiveAppMenu(null);
      return true;
    }

    if (showUnifiedMenu) {
      setShowUnifiedMenu(false);
      return true;
    }

    return false;
  }

  useEffect(() => {
    function closeFromOutside(
      event: MouseEvent
    ) {
      if (
        activeAppMenu &&
        !menuBarRef.current?.contains(
          event.target as Node
        )
      ) {
        setActiveAppMenu(null);
      }
    }

    function closeFromEscape(
      event: KeyboardEvent
    ) {
      if (handleCampfireMenuEscape(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener(
      "mousedown",
      closeFromOutside
    );
    document.addEventListener(
      "keydown",
      closeFromEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        closeFromOutside
      );
      document.removeEventListener(
        "keydown",
        closeFromEscape
      );
    };
  }, [activeAppMenu, infoModal, showUnifiedMenu]);


  function openFriends(
    tab:
      FriendsModalTab
  ) {
    setFriendsModalTab(
      tab
    );


    setShowFriendsModal(
      true
    );
  }


  /*
   * =========================================================
   * CAMPFIRES
   * =========================================================
   */

  const campfireSystem =
    useCampfires(
      profile.id
    );


  const [
    selectedCampfireId,
    setSelectedCampfireId,
  ] =
    useState<
      string | null
    >(
      detachedCampfireId || null
    );


  const [
    campfireMessage,
    setCampfireMessage,
  ] =
    useState("");


  const [
    campfireAction,
    setCampfireAction,
  ] =
    useState("");

  useEffect(() => {
    if (
      selectedCampfireId === null ||
      campfireSystem.loading ||
      detachedWorkspaceKind !== null
    ) {
      return;
    }


    const stillExists =
      campfireSystem
        .campfires
        .some(
          (
            room
          ) =>
            room.id ===
            selectedCampfireId
        );


    if (
      !stillExists
    ) {
      setSelectedCampfireId(
        null
      );
    }
  }, [
    campfireSystem.campfires,
    selectedCampfireId,
  ]);


  const selectedCampfire =
    campfireSystem
      .campfires
      .find(
        (
          room
        ) =>
          room.id ===
          (detachedCampfireId || selectedCampfireId)
      ) ??
    null;


  function returnToDashboard() {
    setSelectedCampfireId(null);
    setCampfireMessage("");
    setShowUnifiedMenu(false);
    setActiveAppMenu(null);
  }

  useEffect(() => {
    function handleDashboardShortcut(event: KeyboardEvent) {
      if (event.altKey && event.key === "ArrowLeft" && selectedCampfireId !== null) {
        event.preventDefault();
        returnToDashboard();
      }
    }

    window.addEventListener("keydown", handleDashboardShortcut);
    return () => window.removeEventListener("keydown", handleDashboardShortcut);
  }, [selectedCampfireId]);


  const [
    homeSearch,
    setHomeSearch,
  ] = useState("");

  const normalizedHomeSearch =
    homeSearch
      .trim()
      .toLocaleLowerCase("pt-BR");

  const visibleCampfires =
    normalizedHomeSearch
      ? campfireSystem.campfires.filter(
          (room) => room.name.toLocaleLowerCase("pt-BR").includes(normalizedHomeSearch)
        )
      : campfireSystem.campfires;


  /*
   * =========================================================
   * CREATE CAMPFIRE
   * =========================================================
   */

  const [
    showCreate,
    setShowCreate,
  ] =
    useState(
      false
    );


  useEffect(() => {
    const source =
      `home-overlays:${profile.id}`;

    setCampfireNativeOverlayBlock(
      source,
      showFriendsModal ||
      showSettings ||
      showCreate ||
      showUnifiedMenu ||
      activeAppMenu !== null ||
      infoModal !== null
    );

    return () => {
      setCampfireNativeOverlayBlock(
        source,
        false
      );
    };
  }, [
    profile.id,
    showFriendsModal,
    showSettings,
    showCreate,
    showUnifiedMenu,
    activeAppMenu,
    infoModal,
  ]);


  const [
    roomName,
    setRoomName,
  ] =
    useState("");


  const [
    privacy,
    setPrivacy,
  ] =
    useState<CampfirePrivacy>(
      "private"
    );


  const [
    lifecycle,
    setLifecycle,
  ] =
    useState<CampfireLifecycleType>(
      "temporary"
    );


  const [
    cover,
    setCover,
  ] =
    useState<CampfireCoverSelection>(() => {
      const preset =
        getCampfireCoverPreset(
          "cinema-night"
        );

      return {
        kind: "preset",
        ref: preset.id,
        previewUrl: preset.url,
      };
    });


  const [
    selectedFriends,
    setSelectedFriends,
  ] =
    useState<
      string[]
    >([]);


  const [
    createError,
    setCreateError,
  ] =
    useState("");


  const [
    creating,
    setCreating,
  ] =
    useState(
      false
    );


  function toggleFriend(
    friendId:
      string
  ) {
    setSelectedFriends(
      (
        current
      ) =>
        current.includes(
          friendId
        )
          ? current.filter(
              (
                id
              ) =>
                id !==
                friendId
            )

          : [
              ...current,
              friendId,
            ]
    );
  }


  function closeCreate() {
    if (
      creating
    ) {
      return;
    }


    setShowCreate(
      false
    );

    setRoomName("");

    setSelectedFriends(
      []
    );

    setPrivacy(
      "private"
    );

    setLifecycle(
      "temporary"
    );

    const preset =
      getCampfireCoverPreset(
        "cinema-night"
      );

    setCover({
      kind: "preset",
      ref: preset.id,
      previewUrl: preset.url,
    });

    setCreateError("");
  }


  async function createCampfire() {
    if (
      !roomName.trim() ||
      creating
    ) {
      return;
    }


    setCreating(
      true
    );

    setCreateError("");


    const result =
      await campfireSystem
        .createCampfire({
          name: roomName,
          privacy,
          inviteeIds: selectedFriends,
          lifecycle,
          coverKind: cover.kind,
          coverRef: cover.ref,
        });


    setCreating(
      false
    );


    if (
      !result.ok
    ) {
      setCreateError(
        result.message
      );

      return;
    }


    closeCreate();


    if (
      result.campfireId
    ) {
      setSelectedCampfireId(
        result.campfireId
      );
    }


    setCampfireMessage(
      "🔥 Campfire acesa!"
    );
  }


  /*
   * =========================================================
   * ROOM ACTIONS
   * =========================================================
   */

  async function leaveRoom(
    room:
      CampfireItem
  ) {
    if (
      campfireAction
    ) {
      return;
    }


    setCampfireAction(
      "leave"
    );

    setCampfireMessage("");


    const result =
      await campfireSystem
        .leaveCampfire(
          room.id
        );


    setCampfireAction("");

    setCampfireMessage(
      result.message
    );
  }


  async function rejoinRoom(
    room:
      CampfireItem
  ) {
    if (
      campfireAction
    ) {
      return;
    }


    setCampfireAction(
      "rejoin"
    );

    setCampfireMessage("");


    const result =
      await campfireSystem
        .rejoinCampfire(
          room.id
        );


    setCampfireAction("");

    setCampfireMessage(
      result.message
    );
  }


  async function acceptRoomInvite(
    room:
      CampfireItem
  ) {
    if (
      !room.inviteId ||
      campfireAction
    ) {
      return;
    }


    setCampfireAction(
      "accept"
    );

    setCampfireMessage("");


    const result =
      await campfireSystem
        .acceptInvite(
          room.inviteId
        );


    setCampfireAction("");

    setCampfireMessage(
      result.message
    );


    if (
      result.ok &&
      result.campfireId
    ) {
      setSelectedCampfireId(
        result.campfireId
      );
    }
  }


  async function declineRoomInvite(
    room:
      CampfireItem
  ) {
    if (
      !room.inviteId ||
      campfireAction
    ) {
      return;
    }


    setCampfireAction(
      "decline"
    );


    const result =
      await campfireSystem
        .declineInvite(
          room.inviteId
        );


    setCampfireAction("");

    setCampfireMessage(
      result.message
    );
  }


  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */

  async function logout() {
    const {
      error,
    } =
      await supabase.auth
        .signOut();


    if (
      error
    ) {
      console.error(
        error
      );
    }
  }

  useEffect(() => {
    function handleDesktopLogoutRequest() {
      void logout();
    }

    window.addEventListener(
      "campfire-desktop-logout-request",
      handleDesktopLogoutRequest
    );

    return () => {
      window.removeEventListener(
        "campfire-desktop-logout-request",
        handleDesktopLogoutRequest
      );
    };
  }, []);


  /*
   * =========================================================
   * PROFILE
   * =========================================================
   */

  const username =
    profile.username ??
    "";


  const visibleName =
    username
      ? `@${username}`
      : "Usuário";


  const avatarLetter =
    (username || "U")
      .charAt(0)
      .toUpperCase();


  /*
   * =========================================================
   * DETACHED WORKSPACE WINDOW
   * =========================================================
   */

  if (detachedWorkspaceKind) {
    if (campfireSystem.loading || !selectedCampfire) {
      return (
        <main className="app blackPianoTheme campfireDetachedWindowRoot" data-campfire-theme="black-piano-glow">
          <div className="campfireDetachedLoading">Acendendo {detachedWorkspaceKind === "messages" ? "Conversa" : detachedWorkspaceKind === "anime" ? "Animes" : "Tela"}…</div>
        </main>
      );
    }

    return (
      <main className="app blackPianoTheme campfireDetachedWindowRoot" data-campfire-theme="black-piano-glow">
        <CampfireView
          key={`${selectedCampfire.id}:${detachedWorkspaceKind}`}
          room={selectedCampfire}
          currentUserId={profile.id}
          profileStatus={liveProfileStatus}
          friends={friendSystem.friends}
          onAddFriend={() => openFriends("add")}
          onOpenSettings={() => setShowSettings(true)}
          message={campfireMessage}
          busy={campfireAction !== ""}
          onLeave={() => void leaveRoom(selectedCampfire)}
          onRejoin={() => void rejoinRoom(selectedCampfire)}
          onAccept={() => void acceptRoomInvite(selectedCampfire)}
          onDecline={() => void declineRoomInvite(selectedCampfire)}
          popoutMode={detachedWorkspaceKind}
        />
      </main>
    );
  }

  /*
   * =========================================================
   * APP
   * =========================================================
   */

  return (
    <div
      className={`app blackPianoTheme ${selectedCampfire ? "campfireModeRoom" : "campfireModeHome"}`}
      data-campfire-theme="black-piano-glow"
      data-campfire-frame="none"
      style={{
        "--cf-left-rail-width": `${leftRailWidth}px`,
        "--cf-right-rail-width": `${rightRailWidth}px`,
        "--cf-window-frame-top-image": "none",
        "--cf-window-frame-side-image": "none",
        "--cf-window-frame-glow": "transparent",
        "--cf-active-theme-texture": "none",
      } as CSSProperties}
    >

      <div className="campfireNativeTitlebar" aria-label="Barra de título do Campfire">
        <span className="campfireNativeTitlebarBrand">Campfire</span>
      </div>

      <nav
        ref={menuBarRef}
        className="blackPianoMenuBar"
        aria-label="Menu Campfire"
      >
        <div className="blackPianoMenuItem">
          <button
            type="button"
            className="blackPianoMenuButton"
            aria-expanded={activeAppMenu === "file"}
            onClick={() =>
              setActiveAppMenu(
                activeAppMenu === "file"
                  ? null
                  : "file"
              )
            }
          >
            Arquivo
          </button>

          {activeAppMenu === "file" && (
            <div className="blackPianoMenuDropdown">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(true);
                  setActiveAppMenu(null);
                }}
              >
                🔥 Nova Campfire
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSettings(true);
                  setActiveAppMenu(null);
                }}
              >
                ⚙ Configurações
              </button>

              <div className="blackPianoMenuSeparator" />

              <button
                type="button"
                onClick={() => {
                  setActiveAppMenu(null);
                  void logout();
                }}
              >
                🚪 Sair da conta
              </button>
            </div>
          )}
        </div>

        <div className="blackPianoMenuItem">
          <button
            type="button"
            className="blackPianoMenuButton"
            aria-expanded={activeAppMenu === "contacts"}
            onClick={() =>
              setActiveAppMenu(
                activeAppMenu === "contacts"
                  ? null
                  : "contacts"
              )
            }
          >
            Contatos
          </button>

          {activeAppMenu === "contacts" && (
            <div className="blackPianoMenuDropdown">
              <button
                type="button"
                onClick={() => {
                  openFriends("add");
                  setActiveAppMenu(null);
                }}
              >
                👤+ Adicionar amigo
              </button>

              <button
                type="button"
                onClick={() => {
                  openFriends("requests");
                  setActiveAppMenu(null);
                }}
              >
                🔔 Pedidos de amizade
                {friendSystem.incomingRequests.length > 0
                  ? ` (${friendSystem.incomingRequests.length})`
                  : ""}
              </button>

              <button
                type="button"
                onClick={() => {
                  openFriends("friends");
                  setActiveAppMenu(null);
                }}
              >
                👥 Meus amigos
              </button>
            </div>
          )}
        </div>

        <div className="blackPianoMenuItem">
          <button
            type="button"
            className="blackPianoMenuButton"
            aria-expanded={activeAppMenu === "actions"}
            onClick={() =>
              setActiveAppMenu(
                activeAppMenu === "actions"
                  ? null
                  : "actions"
              )
            }
          >
            Ações
          </button>

          {activeAppMenu === "actions" && (
            <div className="blackPianoMenuDropdown">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(true);
                  setActiveAppMenu(null);
                }}
              >
                🔥 Nova Campfire
              </button>

              {selectedCampfire?.myState === "active" && (
                <button
                  type="button"
                  disabled={Boolean(campfireAction)}
                  onClick={() => {
                    setActiveAppMenu(null);
                    void leaveRoom(selectedCampfire);
                  }}
                >
                  🚪 Sair da Campfire selecionada
                </button>
              )}

              {selectedCampfire?.myState === "away" && (
                <button
                  type="button"
                  disabled={Boolean(campfireAction)}
                  onClick={() => {
                    setActiveAppMenu(null);
                    void rejoinRoom(selectedCampfire);
                  }}
                >
                  🔥 Reentrar na Campfire selecionada
                </button>
              )}

              {selectedCampfire?.myState === "invited" && (
                <>
                  <button
                    type="button"
                    disabled={Boolean(campfireAction)}
                    onClick={() => {
                      setActiveAppMenu(null);
                      void acceptRoomInvite(selectedCampfire);
                    }}
                  >
                    ✓ Aceitar convite
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(campfireAction)}
                    onClick={() => {
                      setActiveAppMenu(null);
                      void declineRoomInvite(selectedCampfire);
                    }}
                  >
                    ✕ Recusar convite
                  </button>
                </>
              )}

              {!selectedCampfire && (
                <span className="blackPianoMenuHint">
                  Nenhuma Campfire selecionada.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="blackPianoMenuItem">
          <button
            type="button"
            className="blackPianoMenuButton"
            aria-expanded={activeAppMenu === "tools"}
            onClick={() =>
              setActiveAppMenu(
                activeAppMenu === "tools"
                  ? null
                  : "tools"
              )
            }
          >
            Ferramentas
          </button>

          {activeAppMenu === "tools" && (
            <div className="blackPianoMenuDropdown">
              <button
                type="button"
                onClick={() => {
                  setShowSettings(true);
                  setActiveAppMenu(null);
                }}
              >
                🖥 Configurações
              </button>

              <span className="blackPianoMenuHint">
                Idioma, escala da interface, voz, vídeo e fechamento.
              </span>
            </div>
          )}
        </div>

        <div className="blackPianoMenuItem">
          <button
            type="button"
            className="blackPianoMenuButton"
            aria-expanded={activeAppMenu === "help"}
            onClick={() =>
              setActiveAppMenu(
                activeAppMenu === "help"
                  ? null
                  : "help"
              )
            }
          >
            Ajuda
          </button>

          {activeAppMenu === "help" && (
            <div className="blackPianoMenuDropdown">
              <button
                type="button"
                onClick={() => {
                  openAboutFromMenu("help");
                }}
              >
                🔥 Sobre o Campfire
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="blackPianoPlusButton"
          onClick={() => openAboutFromMenu(null)}
          title="Sobre o Campfire"
        >
          Plus!
        </button>
      </nav>

      {/* ====================================================
          TOP BAR
          ==================================================== */}

      <header className="topbar">

        {!selectedCampfire ? (
          <>
            <div className="campfireTopbarBrand">
              <img src={campfireIcon} alt="" />
              <div>
                <strong>Campfire</strong>
              </div>
            </div>

            <nav className="campfireTopbarNav campfireHomeTopNavigation" aria-label="Atalhos da Home">
              <button
                type="button"
                className="active"
                onClick={() => {
                  setHomeSearch("");
                  document.querySelector(".campfireHomeBeautiful")?.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >⌂ Início</button>
              <button
                type="button"
                onClick={() => document.querySelector(".campfireHomeHighlights")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >◈ Explorar</button>
              <button
                type="button"
                onClick={() => document.querySelector(".campfireLeftRailList")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
              >▣ Biblioteca</button>
              <button type="button" onClick={() => setShowCreate(true)}>◇ Criar</button>
            </nav>

            <label className="campfireTopbarSearch">
              <span aria-hidden="true">⌕</span>
              <input
                value={homeSearch}
                onChange={(event) => setHomeSearch(event.target.value)}
                placeholder="Pesquisar Campfires..."
                aria-label="Pesquisar Campfires"
              />
            </label>

            <div className="campfireTopbarAccount">
              <button
                type="button"
                className="campfireTopbarBell"
                onClick={() => openFriends("requests")}
                title="Notificações"
                aria-label="Notificações"
              >
                ♢
                {friendSystem.incomingRequests.length > 0 && (
                  <b>{friendSystem.incomingRequests.length > 99 ? "99+" : friendSystem.incomingRequests.length}</b>
                )}
              </button>
              <button
                type="button"
                className="campfireTopbarBell"
                onClick={() => setShowSettings(true)}
                title="Configurações"
                aria-label="Configurações"
              >
                ⚙
              </button>
              <div
                className="campfireTopbarAccountAvatar"
                style={profile.avatar_url ? { backgroundImage: `url("${profile.avatar_url}")` } : undefined}
              >
                {profile.avatar_url ? "" : avatarLetter}
              </div>
              <div className="campfireTopbarAccountCopy">
                <strong>{visibleName}</strong>
                <small>● {statusText(liveProfileStatus)}</small>
              </div>
            </div>
          </>
        ) : (
          <div className="profile campfireRoomProfile">
            <button
              type="button"
              className="campfireRoomHomeBrand"
              title="Voltar ao Início"
              onClick={returnToDashboard}
            >
              <img src={campfireIcon} alt="Campfire" />
              <span>Campfire</span>
            </button>
            <button
              type="button"
              className="campfireReturnHomeButton"
              title="Voltar ao Início"
              onClick={returnToDashboard}
            >⌂ Início</button>
            <div
              className="avatar"
              style={profile.avatar_url ? {
                backgroundImage: `url("${profile.avatar_url}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                color: "transparent",
              } : undefined}
            >
              {profile.avatar_url ? "" : avatarLetter}
            </div>
            <div>
              <div className="username">{visibleName}</div>
              <div className="status">
                ● {statusText(liveProfileStatus)}
                {livePersonalMessage && <> {" • "}{livePersonalMessage}</>}
              </div>
            </div>
          </div>
        )}

        {selectedCampfire && (
          <>
            <span className="campfireRailCreateTop">
              <button
                type="button"
                className="campfireTopbarCreateButton"
                onClick={() => setShowCreate(true)}
                title="Criar Campfire"
              >
                ＋ Criar Campfire
              </button>
            </span>
            <div className="topButtons">
            <button
              type="button"
              className="campfireUnifiedMenuButton"
              title="Menu do Campfire"
              aria-expanded={showUnifiedMenu}
              onClick={() => setShowUnifiedMenu((open) => !open)}
            >⋯</button>
            <button type="button" title="Adicionar amigo" onClick={() => openFriends("add")}>👤+</button>
            <button type="button" title="Configurações" onClick={() => setShowSettings(true)}>⚙</button>
            <button type="button" title="Sair" onClick={() => void logout()}>🚪</button>
            </div>
          </>
        )}

      </header>

      {showUnifiedMenu && (
        <div className="campfireUnifiedMenu" role="menu" aria-label="Menu do Campfire">
          <button type="button" onClick={() => { setShowCreate(true); setShowUnifiedMenu(false); }}>＋ Nova Campfire</button>
          <button type="button" onClick={() => { openFriends("friends"); setShowUnifiedMenu(false); }}>👥 Amigos</button>
          <button type="button" onClick={() => { setShowSettings(true); setShowUnifiedMenu(false); }}>⚙ Configurações</button>
          <button type="button" onClick={() => openAboutFromMenu("unified")}>🔥 Sobre o Campfire</button>
          <div className="campfireUnifiedMenuSeparator" />
          <button type="button" className="danger" onClick={() => { setShowUnifiedMenu(false); void logout(); }}>🚪 Sair</button>
        </div>
      )}


      {/* ====================================================
          MAIN
          ==================================================== */}

      <div className="main">
        <div
          className="campfireLeftRailResizeHandle campfireRailResizeHandle left"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar barra de Campfires"
          title="Arraste para reduzir a barra de Campfires"
          onMouseDown={(event) => beginRailResize("left", event)}
        />
        <div
          className="campfireRightRailResizeHandle campfireRailResizeHandle right"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar barra de amigos e participantes"
          title="Arraste para reduzir a barra de amigos"
          onMouseDown={(event) => beginRailResize("right", event)}
        />

        {/* ==================================================
            SIDEBAR
            ================================================== */}

        <aside className="sidebar campfireLeftRail">
          <div className="campfireLeftRailBrand">
            <img src={campfireIcon} alt="" />
            <div>
              <strong>CAMPFIRE</strong>
            </div>
          </div>

          {!selectedCampfire && (
            <nav className="campfireHomeNav" aria-label="Navegação inicial">
              <button type="button" className="active"><span>⌂</span> Início</button>
              <button type="button" onClick={() => openFriends("friends")}><span>♟</span> Amigos</button>
              <button type="button" onClick={() => openFriends("friends")}><span>◌</span> Mensagens</button>
              <button type="button" onClick={() => openFriends("requests")}>
                <span>♢</span> Notificações
                {friendSystem.incomingRequests.length > 0 && (
                  <b>{friendSystem.incomingRequests.length > 99 ? "99+" : friendSystem.incomingRequests.length}</b>
                )}
              </button>
            </nav>
          )}

          {selectedCampfire && (
            <div
              className="campfireLeftHero"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(5,7,10,.04), rgba(5,7,10,.82)), url("${resolveCampfireCoverUrl(selectedCampfire.coverKind, selectedCampfire.coverRef)}")`,
              }}
            >
              <span>Boas histórias nos aproximam.</span>
            </div>
          )}

          <div className="sectionTitle campfireTitle">
            <span>SEUS CAMPFIRES</span>
          </div>

          <div className="campfires campfireLeftRailList">
            {campfireSystem.loading && <div className="campfireRailLoading">Carregando Campfires…</div>}
            {!campfireSystem.loading && campfireSystem.campfires.length === 0 && (
              <div className="campfireLeftRailEmpty">
                <strong>Sua próxima conversa começa aqui.</strong>
                <span>Crie uma Campfire para abrir uma nova call.</span>
              </div>
            )}

            {visibleCampfires.map((room) => {
              const coverUrl = resolveCampfireCoverUrl(room.coverKind, room.coverRef);
              const selected = selectedCampfireId === room.id;
              return (
                <button
                  type="button"
                  className={`campfireLeftCard ${selected ? "selected" : ""} ${room.myState === "invited" ? "invited" : ""}`}
                  key={room.id}
                  onClick={() => {
                    setSelectedCampfireId(room.id);
                    setCampfireMessage("");
                  }}
                >
                  <span className="campfireLeftCover" style={{ backgroundImage: `url("${coverUrl}")` }} />
                  <span className="campfireLeftCardCopy">
                    <strong>{room.name}</strong>
                    <small>{room.myState === "invited" ? "Convite recebido" : `${room.activePeople} online`}</small>
                  </span>
                  <span className="campfireLeftStatus" aria-hidden="true" />
                </button>
              );
            })}
          </div>

        </aside>


        {/* ==================================================
            CONTENT
            ================================================== */}

        <main className="content">

          {selectedCampfire ? (
            <CampfireView
              key={
                selectedCampfire.id
              }

              room={
                selectedCampfire
              }

              currentUserId={
                profile.id
              }

              profileStatus={
                liveProfileStatus
              }

              friends={friendSystem.friends}

              onAddFriend={() => openFriends("add")}

              onOpenSettings={() => setShowSettings(true)}

              message={
                campfireMessage
              }

              busy={
                campfireAction !==
                ""
              }

              onLeave={() =>
                void leaveRoom(
                  selectedCampfire
                )
              }

              onRejoin={() =>
                void rejoinRoom(
                  selectedCampfire
                )
              }

              onAccept={() =>
                void acceptRoomInvite(
                  selectedCampfire
                )
              }

              onDecline={() =>
                void declineRoomInvite(
                  selectedCampfire
                )
              }
            />
          ) : (
            <div className="campfireHomeShell">
              <section className="campfireHomeBeautiful">
                <section
                  className="campfireHomeHero campfireHomeHeroMockup"
                  style={{
                    backgroundImage: `url("${getCampfireCoverPreset("forest-fire").url}")`,
                  }}
                >
                  <div className="campfireHomeHeroCopy">
                    <span className="campfireHomeEyebrow">BEM-VINDO DE VOLTA,</span>
                    <h1>{visibleName}</h1>
                    <p className="campfireHomeOnlineLine">● {statusText(liveProfileStatus)}</p>
                    <p className="campfireHomeHeroQuote">“Aqui, sempre há uma fogueira acesa.”</p>
                    <div className="campfireHomeHeroActions">
                      <button type="button" className="primary" onClick={() => setShowCreate(true)}>＋ Criar Campfire</button>
                      <button type="button" className="secondary" onClick={() => openFriends("add")}>Adicionar amigo</button>
                    </div>
                  </div>

                  <div className="campfireHomeHeroStatus">
                    <div>
                      <small>AGORA</small>
                      <strong>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong>
                    </div>
                    <div>
                      <small>STATUS</small>
                      <strong>{statusText(liveProfileStatus)}</strong>
                    </div>
                  </div>

                  <div className="campfireHomeHeroServices" aria-label="Recursos Campfire">
                    <span>Chat</span><span>Voice</span><span>Share</span><span>Watch Together</span><span>Winks</span>
                  </div>
                </section>

                <section className="campfireHomeHighlights">
                  <div className="campfireHomeSectionTitleRow">
                    <h2>🔥 Campfires em destaque</h2>
                    <button type="button" onClick={() => setShowCreate(true)}>Ver todos →</button>
                  </div>
                  <div className="campfireHomeHighlightRow campfireHomeCampfireGrid campfireHomeFeaturedGrid">
                    {visibleCampfires.slice(0, 6).map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        className="campfireHomeHighlightCard"
                        onClick={() => {
                          setSelectedCampfireId(room.id);
                          setCampfireMessage("");
                        }}
                      >
                        <span className="campfireHomeHighlightImage" style={{ backgroundImage: `url("${resolveCampfireCoverUrl(room.coverKind, room.coverRef)}")` }} />
                        <span className="campfireHomeHighlightCopy">
                          <strong>{room.name}</strong>
                          <small>● {room.activePeople} online</small>
                          <span><i>Chat</i><i>Voice</i></span>
                        </span>
                      </button>
                    ))}
                    {[
                      ["music-vinyl", "Black Piano"],
                      ["fantasy-moon", "Animes & Mangás"],
                      ["neon-city", "Tecnologia"],
                      ["cinema-night", "Cine & Séries"],
                      ["gaming-desk", "Games BR"],
                      ["marshmallow", "Viagens & Aventuras"],
                    ].slice(0, Math.max(0, 6 - visibleCampfires.slice(0, 6).length)).map(([presetId, label]) => {
                      const preset = getCampfireCoverPreset(presetId);
                      return (
                        <button key={presetId} type="button" className="campfireHomeHighlightCard" onClick={() => setShowCreate(true)}>
                          <span className="campfireHomeHighlightImage" style={{ backgroundImage: `url("${preset.url}")` }} />
                          <span className="campfireHomeHighlightCopy">
                            <strong>{label}</strong>
                            <small>Crie sua Campfire</small>
                            <span><i>Chat</i><i>Voice</i></span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="campfireHomeDashboardGrid campfireHomeUtilityGrid">
                  <div className="campfireHomeAiPanel">
                    <div className="campfireHomeSectionTitleRow">
                      <h2>✨ IA do Campfire</h2>
                      <span>Pesquisa livre</span>
                    </div>
                    <p className="campfireHomeUtilityLead">Pesquise o que quiser com nossa IA.</p>
                    <div className="campfireHomeAiResponse">
                      {campfireAiResult ? (
                        <>
                          <strong>Resposta</strong>
                          <p>{campfireAiResult.answer}</p>
                          {campfireAiResult.sources.length > 0 && (
                            <div className="campfireHomeAiSources">
                              <span>Fontes</span>
                              {campfireAiResult.sources.map((source) => (
                                <button key={`${source.label}-${source.url}`} type="button" onClick={() => void openUrl(source.url)}>
                                  {source.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <strong>Pesquisa livre</strong>
                          <p>Pesquise o que quiser com nossa IA.</p>
                        </>
                      )}
                      {campfireAiError && <p className="campfireHomeAiError">{campfireAiError}</p>}
                    </div>
                    <div className="campfireHomeAiComposer campfireHomeAiComposerStack">
                      <textarea
                        value={campfireAiPrompt}
                        onChange={(event) => setCampfireAiPrompt(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            void runCampfireAiQuery();
                          }
                        }}
                        placeholder="Pesquise o que quiser com nossa IA"
                        aria-label="Pergunta livre para a IA do Campfire"
                      />
                      <div className="campfireHomeAiActions">
                        <button
                          type="button"
                          disabled={campfireAiLoading || !campfireAiPrompt.trim()}
                          onClick={() => void runCampfireAiQuery()}
                        >
                          {campfireAiLoading ? "Pesquisando…" : "Pesquisar"}
                        </button>
                        <button
                          type="button"
                          className="campfireHomeAiSecondaryButton"
                          onClick={() => { setCampfireAiPrompt(""); setCampfireAiResult(null); setCampfireAiError(""); }}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="campfireHomeNewsPanel">
                    <div className="campfireHomeSectionTitleRow">
                      <h2>📰 Notícias importantes</h2>
                      <span>{campfireNewsLoading ? "Atualizando…" : `Atualizado às ${formatNewsClock(campfireNewsUpdatedAt)}`}</span>
                    </div>
                    <p className="campfireHomeUtilityLead">Atualização automática a cada 5 minutos. Role para baixo e clique em qualquer notícia para abrir a cobertura completa.</p>
                    {campfireNewsError && <p className="campfireHomeNewsStatus">{campfireNewsError} <button type="button" onClick={() => void openUrl("https://news.google.com/home?hl=pt-BR&gl=BR&ceid=BR:pt-419")}>Abrir Google News</button></p>}
                    <div className="campfireHomeNewsFeed">
                      {campfireNews[0] && (
                        <button
                          key={campfireNews[0].id}
                          type="button"
                          className="campfireHomeNewsFeatured"
                          onClick={() => void openUrl(campfireNews[0].url)}
                        >
                          <span className="campfireHomeNewsFeaturedImage">
                            <CampfireNewsImage
                              articleUrl={campfireNews[0].url}
                              feedImageUrl={campfireNews[0].imageUrl}
                              fallbackUrl={resolveNewsFallbackUrl(0)}
                              alt={campfireNews[0].title}
                            />
                          </span>
                          <span className="campfireHomeNewsFeaturedShade" />
                          <span className="campfireHomeNewsFeaturedCopy">
                            <span className="campfireHomeNewsMeta">
                              <b>{campfireNews[0].source}</b>
                              <i>{formatNewsTimeLabel(campfireNews[0].publishedAt)}</i>
                            </span>
                            <strong>{campfireNews[0].title}</strong>
                            <small>{campfireNews[0].summary}</small>
                          </span>
                        </button>
                      )}
                      <div className="campfireHomeNewsGrid">
                        {campfireNews.slice(1).map((item, index) => (
                          <button key={item.id} type="button" className="campfireHomeNewsCard" onClick={() => void openUrl(item.url)}>
                            <span className="campfireHomeNewsThumb">
                              <CampfireNewsImage
                                articleUrl={item.url}
                                feedImageUrl={item.imageUrl}
                                fallbackUrl={resolveNewsFallbackUrl(index + 1)}
                                alt={item.title}
                              />
                            </span>
                            <span className="campfireHomeNewsMeta">
                              <b>{item.source}</b>
                              <i>{formatNewsTimeLabel(item.publishedAt)}</i>
                            </span>
                            <strong>{item.title}</strong>
                            <small>{item.summary}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </section>

              <aside className="campfireHomeRightRail campfireHomeRightColumn">
                <section className="campfireHomeFriendsPanel">
                  <div className="campfireHomeRightTitle"><h3>Amigos online ({friendSystem.friends.filter((friend) => friend.profile.status !== "offline").length})</h3><button type="button" onClick={() => openFriends("friends")}>Ver todos →</button></div>
                  <div className="campfireHomeFriendList">
                    {friendSystem.friends.filter((friend) => friend.profile.status !== "offline").slice(0, 6).map((friend) => {
                      const person = friend.profile;
                      const name = person.display_name || (person.username ? `@${person.username}` : "Usuário");
                      return (
                        <button key={friend.friendshipId} type="button" onClick={() => openFriends("friends")}>
                          <span className="campfireHomeFriendAvatar" style={person.avatar_url ? { backgroundImage: `url("${person.avatar_url}")` } : undefined}>{person.avatar_url ? "" : name.charAt(0).toUpperCase()}</span>
                          <span><strong>{name}</strong><small>{statusText(person.status || "offline")}</small></span>
                          <i className={`campfireHomeFriendDot ${person.status || "offline"}`} />
                        </button>
                      );
                    })}
                    {friendSystem.friends.filter((friend) => friend.profile.status !== "offline").length === 0 && <p>Nenhum amigo online agora.</p>}
                  </div>
                </section>

                <section className="campfireHomeSuggestionsPanel">
                  <div className="campfireHomeRightTitle"><h3>Sugestões para você</h3><button type="button" onClick={() => setShowCreate(true)}>Criar →</button></div>
                  {[
                    ["music-vinyl", "Música & Conversa"],
                    ["gaming-desk", "Games"],
                    ["neon-city", "Tecnologia"],
                    ["marshmallow", "Viagens"],
                  ].map(([presetId, label]) => {
                    const preset = getCampfireCoverPreset(presetId);
                    return (
                      <button key={presetId} type="button" onClick={() => setShowCreate(true)}>
                        <span style={{ backgroundImage: `url("${preset.url}")` }} />
                        <strong>{label}</strong>
                        <b>＋</b>
                      </button>
                    );
                  })}
                </section>

                <section className="campfireHomeQuotePanel">
                  <span>“</span>
                  <blockquote>Grandes conversas começam com pessoas curiosas.</blockquote>
                  <small>🔥</small>
                </section>
              </aside>
            </div>
          )}

        </main>

      </div>


      {/* ====================================================
          FOOTER
          ==================================================== */}

      <footer>

        <span>

          ● Connected as

          {" "}

          @{username}

        </span>


        <span>
          Campfire 1.0.0
        </span>

      </footer>


      {infoModal === "about" && (
        <div
          className="modalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setInfoModal(null);
            }
          }}
        >
          <div className="campfireAboutModal">
            <div className="modalHeader">
              <div>
                <span className="modalFire">🔥</span>
                <strong>Sobre o Campfire</strong>
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="campfireAboutBody">
              <img
                src={campfireIcon}
                alt="Campfire"
              />

              <div>
                <h2>Campfire</h2>
                <p>
                  Mais do que conversar. Reúna-se ao redor da fogueira.
                </p>
                <small>
                  Criador e desenvolvedor: Deivison Santos / @devsaex
                </small>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ====================================================
          FRIENDS MODAL
          ==================================================== */}

      <FriendsModal
        open={
          showFriendsModal
        }

        initialTab={
          friendsModalTab
        }

        currentUsername={
          username
        }

        loading={
          friendSystem.loading
        }

        error={
          friendSystem.error
        }

        friends={
          friendSystem.friends
        }

        incomingRequests={
          friendSystem
            .incomingRequests
        }

        outgoingRequests={
          friendSystem
            .outgoingRequests
        }

        onClose={() =>
          setShowFriendsModal(
            false
          )
        }

        onRefresh={
          friendSystem.refresh
        }

        onSendRequest={
          friendSystem.sendRequest
        }

        onRespondRequest={
          friendSystem.respondRequest
        }

        onCancelRequest={
          friendSystem.cancelRequest
        }

        onRemoveFriend={
          friendSystem.removeFriend
        }
      />


      <nav className="campfireMobileNav" aria-label="Navegação móvel do Campfire">
        <button
          type="button"
          onClick={() => setSelectedCampfireId(null)}
        >
          Campfires
        </button>
        <button
          type="button"
          disabled={!selectedCampfire}
          onClick={() => window.dispatchEvent(new CustomEvent("campfire-mobile-tab", { detail: "chat" }))}
        >
          Chat
        </button>
        <button
          type="button"
          disabled={!selectedCampfire}
          onClick={() => window.dispatchEvent(new CustomEvent("campfire-mobile-tab", { detail: "people" }))}
        >
          Pessoas
        </button>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
        >
          Mais
        </button>
      </nav>

      {/* ====================================================
          SETTINGS
          ==================================================== */}

      <CampfireSettingsModal
        open={
          showSettings
        }
        userId={profile.id}
        campfireId={selectedCampfire?.id ?? null}
        isCampfireOwner={selectedCampfire?.ownerId === profile.id}

        onClose={() =>
          setShowSettings(
            false
          )
        }
      />


      {/* ====================================================
          CREATE CAMPFIRE
          ==================================================== */}

      {showCreate && (
        <div className="modalOverlay">

          <div className="createModal">

            <div className="modalHeader">

              <div>

                <span className="modalFire">
                  🔥
                </span>


                <strong>
                  Criar Campfire
                </strong>

              </div>


              <button
                type="button"

                onClick={
                  closeCreate
                }
              >
                ✕
              </button>

            </div>


            <div className="modalBody">

              <label className="fieldLabel">
                Nome da Campfire
              </label>


              <input
                className="roomNameInput"

                value={
                  roomName
                }

                maxLength={
                  40
                }

                autoFocus

                placeholder="Ex.: Destiny Raid"

                onChange={(
                  event
                ) => {
                  setRoomName(
                    event.target
                      .value
                  );


                  setCreateError("");
                }}
              />


              <label className="fieldLabel">
                Capa da Campfire
              </label>

              <CampfireCoverPicker
                userId={profile.id}
                value={cover}
                disabled={creating}
                onChange={(nextCover) => {
                  setCover(nextCover);
                  setCreateError("");
                }}
              />


              <label className="fieldLabel">
                Duração
              </label>

              <div className="campfireLifecycleOptions">
                <label className={lifecycle === "temporary" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="lifecycle"
                    value="temporary"
                    checked={lifecycle === "temporary"}
                    onChange={() => setLifecycle("temporary")}
                  />
                  <span>
                    <strong>Temporária</strong>
                    <small>Apaga automaticamente após ficar vazia por 5 minutos.</small>
                  </span>
                </label>

                <label className={lifecycle === "permanent" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="lifecycle"
                    value="permanent"
                    checked={lifecycle === "permanent"}
                    onChange={() => setLifecycle("permanent")}
                  />
                  <span>
                    <strong>Permanente</strong>
                    <small>Continua disponível mesmo quando todos saem.</small>
                  </span>
                </label>
              </div>


              <label className="fieldLabel">
                Privacidade
              </label>


              <div className="privacyOptions">

                <label>

                  <input
                    type="radio"

                    name="privacy"

                    value="private"

                    checked={
                      privacy ===
                      "private"
                    }

                    onChange={() =>
                      setPrivacy(
                        "private"
                      )
                    }
                  />


                  <span>

                    <strong>
                      🔒 Private
                    </strong>

                    <small>
                      Somente convidados.
                    </small>

                  </span>

                </label>


                <label>

                  <input
                    type="radio"

                    name="privacy"

                    value="friends"

                    checked={
                      privacy ===
                      "friends"
                    }

                    onChange={() =>
                      setPrivacy(
                        "friends"
                      )
                    }
                  />


                  <span>

                    <strong>
                      👥 Friends
                    </strong>

                    <small>
                      Amigos podem solicitar entrada.
                    </small>

                  </span>

                </label>


                <label>

                  <input
                    type="radio"

                    name="privacy"

                    value="link"

                    checked={
                      privacy ===
                      "link"
                    }

                    onChange={() =>
                      setPrivacy(
                        "link"
                      )
                    }
                  />


                  <span>

                    <strong>
                      🔗 Invite Link
                    </strong>

                    <small>
                      Entrada por convite.
                    </small>

                  </span>

                </label>

              </div>


              <div className="inviteHeader">

                <label className="fieldLabel">
                  Convidar amigos
                </label>


                <small>

                  {
                    selectedFriends.length
                  }

                  {" "}

                  selecionado(s)

                </small>

              </div>


              <div className="inviteFriends">

                {friendSystem
                  .friends
                  .length ===
                  0 && (
                  <div className="inviteEmptyState">
                    Você ainda não possui
                    amigos para convidar.
                  </div>
                )}


                {friendSystem
                  .friends
                  .map(
                    (
                      friend
                    ) => {
                      const person =
                        friend.profile;


                      const name =
                        profileName(
                          person
                        );


                      return (
                        <label
                          className={
                            `inviteFriend ${
                              person.status ===
                              "offline"
                                ? "friendOffline"
                                : ""
                            }`
                          }

                          key={
                            person.id
                          }
                        >

                          <input
                            type="checkbox"

                            checked={
                              selectedFriends.includes(
                                person.id
                              )
                            }

                            onChange={() =>
                              toggleFriend(
                                person.id
                              )
                            }
                          />


                          <div
                            className={
                              `miniAvatar ${statusClass(
                                person.status
                              )}`
                            }
                          >
                            {name
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                          </div>


                          <div>

                            <strong>
                              {name}
                            </strong>


                            <small>
                              @
                              {
                                person.username
                              }
                            </small>

                          </div>

                        </label>
                      );
                    }
                  )}

              </div>


              {createError && (
                <div
                  style={{
                    marginTop:
                      "12px",

                    padding:
                      "9px",

                    border:
                      "1px solid #dfb1b1",

                    borderRadius:
                      "7px",

                    background:
                      "#fff2f2",

                    color:
                      "#944646",

                    fontSize:
                      "10px",
                  }}
                >
                  {createError}
                </div>
              )}



            </div>


            <div className="modalFooter">

              <button
                type="button"

                className="cancelButton"

                disabled={
                  creating
                }

                onClick={
                  closeCreate
                }
              >
                Cancelar
              </button>


              <button
                type="button"

                className="createButton"

                disabled={
                  !roomName.trim() ||
                  creating
                }

                onClick={() =>
                  void createCampfire()
                }
              >

                {creating
                  ? "Acendendo..."
                  : "Criar Campfire"}

              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}


/* ============================================================
   CAMPFIRE VIEW
   ============================================================ */

type CampfireViewProps = {
  room:
    CampfireItem;

  currentUserId:
    string;

  profileStatus:
    string;

  friends:
    import("./useFriendships").FriendItem[];

  onAddFriend:
    () => void;

  onOpenSettings:
    () => void;

  message:
    string;

  busy:
    boolean;

  onLeave:
    () => void;

  onRejoin:
    () => void;

  onAccept:
    () => void;

  onDecline:
    () => void;

  popoutMode?:
    Exclude<CampfireRoomTab, "stage"> | null;
};


function CampfireView({
  room,
  currentUserId,
  profileStatus,
  friends,
  onAddFriend,
  onOpenSettings,
  message,
  busy,
  onLeave,
  onRejoin,
  onAccept,
  onDecline,
  popoutMode = null,
}: CampfireViewProps) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<CampfireRoomTab>(
      "stage"
    );

  const effectiveTab: CampfireRoomTab = popoutMode ?? activeTab;


  const [
    screenLive,
    setScreenLive,
  ] =
    useState(
      false
    );


  /*
   * Novo:
   * painel lateral de participantes.
   */

  const [
    showMembers,
    setShowMembers,
  ] =
    useState(
      false
    );


  const [
    railContextRequest,
    setRailContextRequest,
  ] = useState<SidebarContextRequest | null>(null);

  useEffect(() => {
    const handleMobileTab = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target === "chat") {
        setActiveTab("messages");
        setShowMembers(false);
      }
      if (target === "people") {
        setShowMembers(true);
      }
    };

    window.addEventListener("campfire-mobile-tab", handleMobileTab);
    return () => window.removeEventListener("campfire-mobile-tab", handleMobileTab);
  }, []);


  /*
   * Voz, webcam, presença estilo WLM e volumes locais.
   * A lista de membros é compartilhada entre o dock de voz e
   * o painel lateral para não abrir duas assinaturas iguais.
   */

  const memberSystem =
    useCampfireMembers(
      room.id,
      currentUserId,
      room.myState === "active"
    );


  const voice =
    useCampfireVoice(
      room.id,
      currentUserId,
      profileStatus,
      room.myState === "active"
    );


  const [
    showVoiceMixer,
    setShowVoiceMixer,
  ] = useState(false);


  const [
    voiceFeedback,
    setVoiceFeedback,
  ] = useState("");


  useEffect(() => {
    if (!voiceFeedback) return;
    const timeoutId = window.setTimeout(() => setVoiceFeedback(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [voiceFeedback]);


  function publishVoiceFeedback(result: { message?: string } | null | undefined) {
    if (result?.message) {
      setVoiceFeedback(result.message);
    }
  }


  async function handleVoiceJoinIfNeeded() {
    if (voice.joined) return true;
    publishVoiceFeedback(await voice.joinVoice());
    return true;
  }


  async function handleVoiceMuteToggle() {
    if (!voice.joined) {
      await handleVoiceJoinIfNeeded();
      return;
    }
    publishVoiceFeedback(await voice.toggleMute());
  }


  async function handleVoiceCameraToggle() {
    if (!voice.joined) {
      await handleVoiceJoinIfNeeded();
      return;
    }
    publishVoiceFeedback(await voice.toggleCamera());
  }


  async function handleVoiceDeafenToggle() {
    if (!voice.joined) {
      await handleVoiceJoinIfNeeded();
      return;
    }
    publishVoiceFeedback(await voice.toggleDeafen());
  }


  const directCall =
    useCampfireDirectCall(
      room.id,
      currentUserId,
      room.myState === "active"
    );


  const [
    directMessageTargetId,
    setDirectMessageTargetId,
  ] = useState<string | null>(null);


  const [
    verificationTargetId,
    setVerificationTargetId,
  ] = useState<string | null>(null);


  const [
    profileTargetId,
    setProfileTargetId,
  ] = useState<string | null>(null);


  const directMessageTarget = directMessageTargetId
    ? memberSystem.members.find((member) => member.id === directMessageTargetId) ?? null
    : null;


  const verificationTarget = verificationTargetId
    ? memberSystem.members.find((member) => member.id === verificationTargetId) ?? null
    : null;


  const profileTarget = profileTargetId
    ? memberSystem.members.find((member) => member.id === profileTargetId) ?? null
    : null;


  const roomOverlayOpen =
    effectiveTab !== "anime" ||
    showMembers ||
    directMessageTarget !== null ||
    verificationTarget !== null ||
    profileTarget !== null ||
    directCall.session !== null;


  useEffect(() => {
    const source =
      `room-overlays:${room.id}`;

    setCampfireNativeOverlayBlock(
      source,
      roomOverlayOpen
    );

    return () => {
      setCampfireNativeOverlayBlock(
        source,
        false
      );
    };
  }, [
    room.id,
    roomOverlayOpen,
  ]);


  useEffect(() => {
    if (room.myState !== "active" || !currentUserId) return;
    void ensureCampfireIdentity(currentUserId).catch((identityError) => {
      console.warn("Não foi possível publicar a chave de identidade Campfire:", identityError);
    });
  }, [currentUserId, room.id, room.myState]);


  useEffect(() => {
    if (room.myState !== "active") return;
    const isForRoom = (event: Event) => {
      const detail = (event as CustomEvent<{ campfireId?: string; userId?: string }>).detail;
      return detail?.campfireId === room.id && typeof detail.userId === "string"
        ? detail
        : null;
    };
    const openDm = (event: Event) => {
      const detail = isForRoom(event);
      if (detail) setDirectMessageTargetId(detail.userId ?? null);
    };
    const startCall = (event: Event) => {
      const detail = isForRoom(event);
      if (detail?.userId) void directCall.startCall(detail.userId);
    };
    const showVerification = (event: Event) => {
      const detail = isForRoom(event);
      if (detail) setVerificationTargetId(detail.userId ?? null);
    };
    const openProfile = (event: Event) => {
      const detail = isForRoom(event);
      if (detail) setProfileTargetId(detail.userId ?? null);
    };
    window.addEventListener("campfire-open-direct-message", openDm);
    window.addEventListener("campfire-start-direct-call", startCall);
    window.addEventListener("campfire-show-verification-code", showVerification);
    window.addEventListener("campfire-open-profile", openProfile);
    return () => {
      window.removeEventListener("campfire-open-direct-message", openDm);
      window.removeEventListener("campfire-start-direct-call", startCall);
      window.removeEventListener("campfire-show-verification-code", showVerification);
      window.removeEventListener("campfire-open-profile", openProfile);
    };
  }, [directCall.startCall, room.id, room.myState]);


  /*
   * Ao entrar em outra Campfire,
   * começa no palco e fecha
   * qualquer painel aberto.
   */

  useEffect(() => {
    setActiveTab(
      "stage"
    );

    setScreenLive(
      false
    );

    setShowMembers(
      false
    );
  }, [
    room.id,
  ]);


  const roomEvents =
    useCampfireRoomEvents({
      campfireId:
        room.myState ===
        "active"
          ? room.id
          : null,

      messagesTabActive:
        effectiveTab ===
        "messages",

      roomName: room.name,
      currentUserId,
    });


  function openTab(
    tab:
      CampfireRoomTab
  ) {
    setActiveTab(
      tab
    );


    if (
      tab ===
      "messages"
    ) {
      roomEvents
        .markMessagesRead();
    }
  }


  async function openWorkspace(payload: {
    kind: Exclude<CampfireRoomTab, "stage">;
    campfireId: string;
  }) {
    if (payload.kind === "messages") roomEvents.markMessagesRead();
    try {
      const opened = await openCampfireWorkspaceWindow(payload);
      if (opened) return;
    } catch (error) {
      console.warn("Não foi possível abrir a janela independente do Campfire:", error);
    }
    openTab(payload.kind);
  }

  const stageMembers = memberSystem.members;
  const featuredMember =
    stageMembers.find((member) => member.id === currentUserId && voice.cameraEnabled) ||
    stageMembers.find((member) => voice.speakingParticipantIds.has(member.id)) ||
    stageMembers.find((member) => member.id === currentUserId) ||
    stageMembers[0] ||
    null;

  const featuredName = featuredMember
    ? (featuredMember.display_name || (featuredMember.username ? `@${featuredMember.username}` : "Usuário"))
    : room.name;

  const featuredMicEnabled = featuredMember
    ? voice.presence[featuredMember.id]?.micEnabled !== false
    : true;

  const featuredCameraEnabled = featuredMember
    ? featuredMember.id === currentUserId
      ? voice.cameraEnabled === true
      : voice.presence[featuredMember.id]?.cameraEnabled === true
    : false;

  const featuredCameraStream = featuredMember && featuredCameraEnabled
    ? featuredMember.id === currentUserId
      ? voice.localCameraStream
      : (voice.remoteStreams as Record<string, MediaStream>)[featuredMember.id]
    : null;

  const secondaryStageMembers = featuredMember
    ? stageMembers.filter((member) => member.id !== featuredMember.id)
    : stageMembers;

  const voiceProfileStatus =
    voice.voiceProfile === "strong"
      ? voice.rnnoiseActive
        ? "Supressão forte • RNNoise ativo"
        : "Voz limpa • RNNoise indisponível"
      : voice.voiceProfile === "studio"
        ? "Studio / Hi-Fi"
        : "Voz limpa • Supressão nativa";

  if (room.myState === "active" && popoutMode) {
    return (
      <div className={`campfireDetachedWorkspace campfireDetachedWorkspace-${popoutMode}`}>
        {popoutMode === "messages" && (
          <CampfireChat
            campfireId={room.id}
            currentUserId={currentUserId}
            memberSystem={memberSystem}
            voice={voice}
          />
        )}
        {popoutMode === "screen" && (
          <CampfireScreenShare campfireId={room.id} onLiveChange={setScreenLive} />
        )}
        {popoutMode === "anime" && (
          <AnimeBrowser
            campfireId={room.id}
            onWatchTogether={() => void openWorkspace({ kind: "screen", campfireId: room.id })}
          />
        )}
      </div>
    );
  }

  /*
   * =========================================================
   * ACTIVE CAMPFIRE
   * =========================================================
   */

  if (
    room.myState ===
    "active"
  ) {
    return (
      <div className="campfireRoomShell">

        <div className="campfireStage campfireStageMockup">
          <section className={`campfireSpotlightCard campfireSpotlightPrimary ${featuredMember && voice.speakingParticipantIds.has(featuredMember.id) ? "speaking" : ""}`}>
            <div className="campfireSpotlightGlow" />
            {featuredCameraStream ? (
              <CampfireStageVideo
                stream={featuredCameraStream}
                label={`Câmera de ${featuredName}`}
                className="campfireSpotlightCamera"
              />
            ) : (
              <div
                className="campfireSpotlightAvatar"
                style={featuredMember?.avatar_url
                  ? { backgroundImage: `url("${featuredMember.avatar_url}")` }
                  : undefined}
              >
                {featuredMember?.avatar_url ? "" : featuredName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="campfireSpotlightCopy">
              <span className="campfireHomeEyebrow">AGORA NA CALL</span>
              <h3>{featuredName}</h3>
              <p>{featuredMember?.id === currentUserId ? "Você está nesta Campfire" : (featuredMicEnabled ? "Conversando agora" : "Ouvindo")}</p>
            </div>
            <div className="campfireSpotlightWave" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          </section>

          <div className="campfireParticipantTiles campfireStageParticipants campfireParticipantGrid" aria-label="Participantes na call">
            {secondaryStageMembers.slice(0, 4).map((member) => {
              const name = member.display_name || (member.username ? `@${member.username}` : "Usuário");
              const speaking = voice.speakingParticipantIds.has(member.id);
              const micEnabled = voice.presence[member.id]?.micEnabled !== false;
              const cameraEnabled = member.id === currentUserId
                ? voice.cameraEnabled === true
                : voice.presence[member.id]?.cameraEnabled === true;
              const cameraStream = cameraEnabled
                ? member.id === currentUserId
                  ? voice.localCameraStream
                  : (voice.remoteStreams as Record<string, MediaStream>)[member.id]
                : null;

              return (
                <div className={`campfireParticipantTile ${speaking ? "speaking" : ""}`} key={member.id}>
                  {cameraStream ? (
                    <CampfireStageVideo
                      stream={cameraStream}
                      label={`Câmera de ${name}`}
                      className="campfireParticipantCamera"
                    />
                  ) : (
                    <span
                      className="campfireParticipantTileAvatar campfireStageAvatar"
                      style={member.avatar_url ? { backgroundImage: `url("${member.avatar_url}")` } : undefined}
                    >
                      {member.avatar_url ? "" : name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <strong>{name}</strong>
                  <small>{member.id === currentUserId ? "Você" : (micEnabled ? "Ouvindo" : "Microfone mutado")}</small>
                  <span className={`campfireParticipantTileMic ${micEnabled ? "on" : "off"}`}>{micEnabled ? "🎙" : "⌁"}</span>
                </div>
              );
            })}

            <button type="button" className="campfireParticipantTile campfireParticipantMore" onClick={() => setShowMembers(true)}>
              <span>＋</span>
              <strong>Participantes</strong>
              <small>{Math.max(0, stageMembers.length - secondaryStageMembers.slice(0, 4).length)} mais</small>
            </button>
          </div>
        </div>

        {/* ==================================================
            HEADER
            ================================================== */}

        <div className="campfireRoomHeader">
          <div className="campfireRoomIdentity">
            <div className="campfireRoomIdentityText">
              <h2>{room.name}</h2>
              <div>
                <b>● {room.activePeople} pessoa(s)</b>
                <span>•</span>
                <span>{privacyText(room.privacy)}</span>
                <span>•</span>
                <span>{room.persistent ? "Permanent" : "Temporary"}</span>
              </div>
            </div>
          </div>

          <div className="campfireRoomHeaderControls">
            <div className="campfireRoomModeButtons" role="toolbar" aria-label="Navegação da Campfire">
              <button
                type="button"
                className={`campfireRoomModeButton ${activeTab === "messages" ? "active" : ""}`}
                onClick={() => void openWorkspace({ kind: "messages", campfireId: room.id })}
                title="Conversa"
              >
                <span aria-hidden="true">💬</span>
                <span>Conversa</span>
                {roomEvents.unreadMessages > 0 && (
                  <b className="campfireQuickActionBadge">
                    {roomEvents.unreadMessages > 99 ? "99+" : roomEvents.unreadMessages}
                  </b>
                )}
              </button>

              <button
                type="button"
                className={`campfireRoomModeButton ${activeTab === "anime" ? "active" : ""}`}
                onClick={() => void openWorkspace({ kind: "anime", campfireId: room.id })}
                title="Animes"
              >
                <span aria-hidden="true">📺</span>
                <span>Animes</span>
              </button>

              <button
                type="button"
                className={`campfireRoomModeButton ${activeTab === "screen" ? "active" : ""}`}
                onClick={() => void openWorkspace({ kind: "screen", campfireId: room.id })}
                title="Tela"
              >
                <span aria-hidden="true">🖥</span>
                <span>Tela</span>
                {screenLive && <b className="campfireQuickActionLive">LIVE</b>}
              </button>

              <button
                type="button"
                className="campfireRoomModeButton"
                onClick={() => setShowMembers(true)}
                title="Participantes"
              >
                <span aria-hidden="true">👥</span>
                <span>Participantes</span>
              </button>

              <button
                type="button"
                className="campfireRoomModeButton"
                onClick={onOpenSettings}
                title="Configurações"
              >
                <span aria-hidden="true">⚙</span>
                <span>Configurações</span>
              </button>
            </div>
          </div>
        </div>




        {message && (
          <div className="campfireRoomNotice">
            {message}
          </div>
        )}

        <div className="campfireRoomActionDockWrap">
          {showVoiceMixer && (
            <section className="campfireVoiceMixerPanel">
              <div className="campfireVoiceMixerPanelHeader">
                <div>
                  <strong>Controle avançado de voz</strong>
                  <small>{voiceProfileStatus}</small>
                </div>
                <button type="button" onClick={() => setShowVoiceMixer(false)} aria-label="Fechar controle avançado de voz">×</button>
              </div>
              <div className="campfireVoiceMixerPanelGrid">
                <label className="campfireVoiceMixerField">
                  <span>Perfil de voz</span>
                  <select
                    aria-label="Perfil de voz"
                    value={voice.voiceProfile}
                    onChange={(event) => {
                      publishVoiceFeedback(voice.setVoiceProfile(event.target.value as "clean" | "strong" | "studio"));
                    }}
                  >
                    <option value="clean">Voz limpa</option>
                    <option value="strong">Supressão forte</option>
                    <option value="studio">Studio / Hi-Fi</option>
                  </select>
                </label>

                <div className="campfireVoiceMixerField campfireVoiceMeterCard">
                  <span>Seu microfone</span>
                  <div
                    className="campfireVoiceMeter"
                    role="meter"
                    aria-label="Nível do seu microfone"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={voice.inputLevel}
                  >
                    <i style={{ width: `${voice.inputLevel}%` }} />
                  </div>
                  <small>{voice.inputLevel}% entrada • {voice.processedLevel}% processado</small>
                </div>

                <label className="campfireVoiceMixerField">
                  <span>Meu microfone para os outros <b>{voice.outgoingVolume}%</b></span>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={voice.outgoingVolume}
                    onChange={(event) => voice.setOutgoingVolume(Number(event.target.value))}
                  />
                </label>

                <label className="campfireVoiceMixerToggle">
                  <input
                    type="checkbox"
                    checked={voice.monitorEnabled}
                    onChange={(event) => voice.setMonitorEnabled(event.target.checked)}
                  />
                  <span>Ouvir meu próprio microfone</span>
                </label>

                {voice.monitorEnabled && (
                  <label className="campfireVoiceMixerField">
                    <span>Meu retorno <b>{voice.monitorVolume}%</b></span>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={voice.monitorVolume}
                      onChange={(event) => voice.setMonitorVolume(Number(event.target.value))}
                    />
                  </label>
                )}
              </div>
            </section>
          )}

          {voiceFeedback && (
            <div className="campfireRoomActionFeedback" role="status" aria-live="polite">
              {voiceFeedback}
            </div>
          )}

          <div className="campfireRoomActionDock" role="toolbar" aria-label="Controles principais da Campfire">
            <button
              type="button"
              className={`campfireRoomActionButton accent ${voice.muted ? "isActive isMuted" : ""}`}
              onClick={() => void handleVoiceMuteToggle()}
              title={voice.muted ? "Ativar microfone" : "Mutar microfone"}
            >
              <span aria-hidden="true">{voice.muted ? "🔇" : "🎙"}</span>
              <strong>Microfone</strong>
            </button>

            <button
              type="button"
              className={`campfireRoomActionButton ${voice.cameraEnabled ? "isActive isCameraOn" : ""}`}
              disabled={!voice.hasCamera}
              onClick={() => void handleVoiceCameraToggle()}
              title={voice.hasCamera ? (voice.cameraEnabled ? "Desligar câmera" : "Ligar câmera") : "Nenhuma webcam detectada"}
            >
              <span aria-hidden="true">📹</span>
              <strong>Câmera</strong>
            </button>

            <button
              type="button"
              className={`campfireRoomActionButton ${voice.deafened ? "isActive isDeafened" : ""}`}
              onClick={() => void handleVoiceDeafenToggle()}
              title={voice.deafened ? "Ativar áudio para mim" : "Abafar áudio para mim"}
            >
              <span aria-hidden="true">{voice.deafened ? "🔕" : "🔊"}</span>
              <strong>Abafar</strong>
            </button>

            <button
              type="button"
              className="campfireRoomActionButton danger"
              disabled={busy}
              onClick={onLeave}
              title="Sair da Campfire"
            >
              <span aria-hidden="true">☎</span>
              <strong>Sair</strong>
            </button>

            <button
              type="button"
              className={`campfireRoomActionButton ${showVoiceMixer ? "isActive" : ""}`}
              onClick={() => setShowVoiceMixer((value) => !value)}
              title="Controle avançado de voz"
            >
              <span aria-hidden="true">🔊</span>
              <strong>Volume</strong>
            </button>

            <button
              type="button"
              className="campfireRoomActionButton"
              onClick={onOpenSettings}
              title="Configurações"
            >
              <span aria-hidden="true">⚙</span>
              <strong>Configurações</strong>
            </button>
          </div>
        </div>


        {/* ==================================================
            WORKSPACE OVERLAY — hidden until user opens an action
            ================================================== */}

        <div className={`campfireWorkspaceOverlay ${activeTab !== "stage" ? "open" : ""}`}>
          <section
            role="tabpanel"
            className={`campfireWorkspacePanel campfireChatOverlay ${activeTab === "messages" ? "active" : ""}`}
            aria-hidden={activeTab !== "messages"}
          >
            <div className="campfireWorkspaceChrome">
              <strong>Conversa</strong>
              <button type="button" aria-label="Fechar conversa" title="Fechar" onClick={() => openTab("stage")}>×</button>
            </div>
            <CampfireChat
              campfireId={room.id}
              currentUserId={currentUserId}
              memberSystem={memberSystem}
              voice={voice}
            />
          </section>

          <section
            role="tabpanel"
            className={`campfireWorkspacePanel ${activeTab === "screen" ? "active" : ""}`}
            aria-hidden={activeTab !== "screen"}
          >
            <div className="campfireWorkspaceChrome">
              <strong>Tela</strong>
              <button type="button" aria-label="Fechar compartilhamento" title="Fechar" onClick={() => openTab("stage")}>×</button>
            </div>
            <CampfireScreenShare campfireId={room.id} onLiveChange={setScreenLive} />
          </section>

          <section
            role="tabpanel"
            className={`campfireWorkspacePanel ${activeTab === "anime" ? "active" : ""}`}
            aria-hidden={activeTab !== "anime"}
          >
            <div className="campfireWorkspaceChrome">
              <strong>Anime</strong>
              <button type="button" aria-label="Fechar Anime" title="Fechar" onClick={() => openTab("stage")}>×</button>
            </div>
            <AnimeBrowser
              campfireId={room.id}
              onWatchTogether={() => void openWorkspace({ kind: "screen", campfireId: room.id })}
            />
          </section>
        </div>

        <CampfireRightRail
          friends={friends}
          members={memberSystem.members}
          currentUserId={currentUserId}
          moodCoverUrl={resolveCampfireCoverUrl(room.coverKind, room.coverRef)}
          moodRoomName={room.name}
          onAddFriend={onAddFriend}
          onParticipantContextMenu={(userId, x, y) => {
            setRailContextRequest({
              campfireId: room.id,
              userId,
              x,
              y,
              nonce: Date.now() + Math.random(),
            });
          }}
        />


        {/* ==================================================
            MEMBERS PANEL
            ================================================== */}

        <CampfireMembersPanel
          open={
            showMembers
          }

          campfireId={
            room.id
          }

          currentUserId={
            currentUserId
          }

          memberSystem={
            memberSystem
          }

          voice={
            voice
          }

          externalContextRequest={
            railContextRequest
          }

          onClose={() =>
            setShowMembers(
              false
            )
          }
        />


        <CampfireUserProfileModal
          open={profileTarget !== null}
          target={profileTarget}
          voice={voice}
          onClose={() => setProfileTargetId(null)}
        />


        <CampfireDirectMessageModal
          open={directMessageTarget !== null}
          currentUserId={currentUserId}
          target={directMessageTarget}
          onClose={() => setDirectMessageTargetId(null)}
        />


        <CampfireDirectCallOverlay
          call={directCall}
          members={memberSystem.members}
          currentUserId={currentUserId}
        />


        <CampfireVerificationModal
          open={verificationTarget !== null}
          currentUserId={currentUserId}
          target={verificationTarget}
          onClose={() => setVerificationTargetId(null)}
        />

      </div>
    );
  }


  /*
   * =========================================================
   * INVITED
   * =========================================================
   */

  if (
    room.myState ===
    "invited"
  ) {
    return (
      <div className="campfireInactiveCard">

        <div className="campfireInactiveFlame">
          📨
        </div>


        <h2>
          {room.name}
        </h2>


        <p>
          Você recebeu um convite
          para entrar nesta Campfire.
        </p>


        <p>

          {room.activePeople}

          {" "}

          pessoa(s) estão lá agora.

        </p>


        {message && (
          <p>
            {message}
          </p>
        )}


        <div className="campfireInactiveActions">

          <button
            type="button"

            className="primary"

            disabled={
              busy
            }

            onClick={
              onAccept
            }
          >
            ✓ Accept Invite
          </button>


          <button
            type="button"

            className="secondary"

            disabled={
              busy
            }

            onClick={
              onDecline
            }
          >
            ✕ Decline
          </button>

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * LEFT
   * =========================================================
   */

  return (
    <div className="campfireInactiveCard campfireInactiveCard--left">

      <div className="campfireInactiveFlame">
        🔥
      </div>


      <h2>
        {room.name}
      </h2>


      <p>
        Você saiu desta Campfire.
      </p>


      {room.expiresAt ? (
        <CampfireExpiryCountdown expiresAt={room.expiresAt} />
      ) : (
        <p>

          {room.activePeople}

          {" "}

          pessoa(s) continuam
          dentro da Campfire.

        </p>
      )}


      {message && (
        <p>
          {message}
        </p>
      )}


      <div className="campfireInactiveActions">

        <button
          type="button"

          className="primary"

          disabled={
            busy
          }

          onClick={
            onRejoin
          }
        >
          🔥 Rejoin Campfire
        </button>

      </div>

    </div>
  );
}


export default CampfireHome;