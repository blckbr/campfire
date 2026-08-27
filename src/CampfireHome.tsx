import {
  useEffect,
  useRef,
  useState,
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
} from "./useCampfires";

import CampfireChat
  from "./CampfireChat";

import CampfireScreenShare
  from "./CampfireScreenShare";

import AnimeBrowser
  from "./AnimeBrowser";

import CampfireMembersPanel
  from "./CampfireMembersPanel";

import {
  useCampfireRoomEvents,
} from "./useCampfireRoomEvents";

import {
  useCampfireMembers,
} from "./useCampfireMembers";

import {
  useCampfireVoice,
} from "./useCampfireVoice";

import CampfireVoiceDock
  from "./CampfireVoiceDock";

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

import "./App.css";
import "./CampfireTabs.css";
import campfireIcon from "./assets/campfire-icon.png";


type Props = {
  profile:
    CampfireProfile;
};


type CampfireRoomTab =
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


/* ============================================================
   HOME
   ============================================================ */

function CampfireHome({
  profile,
}: Props) {
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
      if (event.key === "Escape") {
        setActiveAppMenu(null);
        setInfoModal(null);
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
  }, [activeAppMenu]);


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
      null
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

  const [
    sidebarContextRequest,
    setSidebarContextRequest,
  ] = useState<SidebarContextRequest | null>(null);


  useEffect(() => {
    if (
      selectedCampfireId &&
      campfireSystem
        .campfires
        .some(
          (
            room
          ) =>
            room.id ===
            selectedCampfireId
        )
    ) {
      return;
    }


    const active =
      campfireSystem
        .campfires
        .find(
          (
            room
          ) =>
            room.myState ===
            "active"
        );


    setSelectedCampfireId(
      active?.id ??
      campfireSystem
        .campfires[0]
        ?.id ??
      null
    );
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
          selectedCampfireId
      ) ??
    null;


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
        .createCampfire(
          roomName,
          privacy,
          selectedFriends
        );


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
   * APP
   * =========================================================
   */

  return (
    <div className="app blackPianoTheme">

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
                  setInfoModal("about");
                  setActiveAppMenu(null);
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
          onClick={() => setInfoModal("about")}
          title="Sobre o Campfire"
        >
          Plus!
        </button>
      </nav>

      {/* ====================================================
          TOP BAR
          ==================================================== */}

      <header className="topbar">

        <div className="profile">

          <div className="campfireBrandBadge" title="Campfire">
            <img
              src={campfireIcon}
              alt="Campfire"
            />
          </div>

          <div
            className="avatar"

            style={
              profile.avatar_url
                ? {
                    backgroundImage:
                      `url("${profile.avatar_url}")`,

                    backgroundSize:
                      "cover",

                    backgroundPosition:
                      "center",

                    color:
                      "transparent",
                  }

                : undefined
            }
          >
            {profile.avatar_url
              ? ""
              : avatarLetter}
          </div>


          <div>

            <div className="username">
              {visibleName}
            </div>


            <div className="status">

              ● {statusText(
                liveProfileStatus
              )}

              {livePersonalMessage && (
                <>
                  {" • "}
                  {livePersonalMessage}
                </>
              )}

            </div>

          </div>

        </div>


        <div className="topButtons">

          <button
            type="button"

            title="Adicionar amigo"

            onClick={() =>
              openFriends(
                "add"
              )
            }
          >
            👤+
          </button>


          <button
            type="button"

            title="Configurações"

            onClick={() =>
              setShowSettings(
                true
              )
            }
          >
            ⚙
          </button>


          <button
            type="button"

            title="Sair"

            onClick={() =>
              void logout()
            }
          >
            🚪
          </button>

        </div>

      </header>


      {/* ====================================================
          MAIN
          ==================================================== */}

      <div className="main">

        {/* ==================================================
            SIDEBAR
            ================================================== */}

        <aside className="sidebar">

          <input
            className="search"

            placeholder="Pesquisar amigos..."
          />


          <div className="sectionTitle">

            <span>
              FRIENDS
            </span>


            <div
              style={{
                display:
                  "flex",

                gap:
                  "4px",
              }}
            >

              {friendSystem
                .incomingRequests
                .length >
                0 && (
                <button
                  type="button"

                  title="Pedidos"

                  onClick={() =>
                    openFriends(
                      "requests"
                    )
                  }
                >
                  🔔
                  {
                    friendSystem
                      .incomingRequests
                      .length
                  }
                </button>
              )}


              <button
                type="button"

                title="Adicionar amigo"

                onClick={() =>
                  openFriends(
                    "add"
                  )
                }
              >
                ＋
              </button>

            </div>

          </div>


          <div className="friends">

            {friendSystem
              .loading && (
              <div
                style={{
                  padding:
                    "15px",

                  textAlign:
                    "center",

                  color:
                    "#8999a0",

                  fontSize:
                    "10px",
                }}
              >
                Carregando amigos...
              </div>
            )}


            {!friendSystem
              .loading &&
              friendSystem
                .friends
                .length ===
                0 && (
                <div
                  style={{
                    padding:
                      "16px 10px",

                    textAlign:
                      "center",

                    color:
                      "#8999a0",

                    fontSize:
                      "10px",
                  }}
                >
                  Nenhum amigo ainda.
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


                  const state =
                    statusClass(
                      person.status
                    );


                  return (
                    <button
                      type="button"

                      className="friend"

                      key={
                        friend.friendshipId
                      }
                    >

                      <div
                        className={
                          `friendAvatar ${state}`
                        }

                        style={
                          person.avatar_url
                            ? {
                                backgroundImage:
                                  `url("${person.avatar_url}")`,

                                backgroundSize:
                                  "cover",

                                backgroundPosition:
                                  "center",
                              }

                            : undefined
                        }
                      >
                        {person.avatar_url
                          ? ""

                          : name
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                      </div>


                      <div className="friendText">

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


                      {person.status !==
                        "offline" && (
                        <span className="invite">
                          🔥
                        </span>
                      )}

                    </button>
                  );
                }
              )}

          </div>


          {/* =================================================
              CAMPFIRES SIDEBAR
              ================================================= */}

          <div className="sectionTitle campfireTitle">

            <span>
              CAMPFIRES
            </span>


            <button
              type="button"

              onClick={() =>
                setShowCreate(
                  true
                )
              }
            >
              ＋
            </button>

          </div>


          <div className="campfires">

            {campfireSystem
              .loading && (
              <div
                style={{
                  padding:
                    "15px",

                  textAlign:
                    "center",

                  color:
                    "#8999a0",

                  fontSize:
                    "10px",
                }}
              >
                Carregando...
              </div>
            )}


            {!campfireSystem
              .loading &&
              campfireSystem
                .campfires
                .length ===
                0 && (
                <div
                  style={{
                    padding:
                      "18px 10px",

                    textAlign:
                      "center",

                    color:
                      "#8999a0",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.5",
                  }}
                >
                  Nenhuma Campfire acesa.
                </div>
              )}


            {campfireSystem
              .campfires
              .map(
                (
                  room
                ) => (
                  <div
                    className="campfire"
                    key={room.id}
                    style={
                      selectedCampfireId === room.id
                        ? {
                            outline:
                              "2px solid rgba(220,115,48,.25)",
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className="campfireMain"
                      onClick={() => {
                        setSelectedCampfireId(room.id);
                        setCampfireMessage("");
                      }}
                    >
                      <span className="fire">
                        {room.myState === "invited" ? "📨" : "🔥"}
                      </span>

                      <div className="campfireMainCopy">
                        <strong>{room.name}</strong>
                        {room.myState === "invited" && (
                          <small>Convite recebido</small>
                        )}
                      </div>
                    </button>

                    {room.myState === "active" && (
                      <div
                        className="campfireRoster"
                        aria-label={`Participantes de ${room.name}`}
                      >
                        {room.members.length === 0 ? (
                          <span className="campfireRosterEmpty">
                            Nenhum usuário disponível
                          </span>
                        ) : (
                          room.members.map((member) => (
                            <span
                              className="campfireRosterUser"
                              key={member.id}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedCampfireId(room.id);
                                setSidebarContextRequest({
                                  campfireId: room.id,
                                  userId: member.id,
                                  x: event.clientX,
                                  y: event.clientY,
                                  nonce: Date.now() + Math.random(),
                                });
                              }}
                            >
                              <span aria-hidden="true">
                                {member.isLeader ? "👑" : "•"}
                              </span>
                              <b>
                                {member.username
                                  ? `@${member.username}`
                                  : "Usuário"}
                              </b>
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

          </div>


          <button
            type="button"

            className="startCampfire"

            onClick={() =>
              setShowCreate(
                true
              )
            }
          >
            🔥 Start a Campfire
          </button>

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

              message={
                campfireMessage
              }

              busy={
                campfireAction !==
                ""
              }

              externalContextRequest={
                sidebarContextRequest?.campfireId === selectedCampfire.id
                  ? sidebarContextRequest
                  : null
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
            <div className="welcome">

              <div className="logo">
                🔥
              </div>


              <h1>
                Campfire
              </h1>


              <p>
                Reúna seus amigos,
                converse, jogue e
                compartilhe momentos.
              </p>


              <div className="actions">

                <button
                  type="button"

                  className="primary"

                  onClick={() =>
                    setShowCreate(
                      true
                    )
                  }
                >
                  🔥 Start a Campfire
                </button>


                <button
                  type="button"

                  className="secondary"

                  onClick={() =>
                    openFriends(
                      "add"
                    )
                  }
                >
                  👤 Add Friend
                </button>

              </div>


              <div className="features">

                <div>
                  <span>
                    💬
                  </span>

                  <small>
                    Chat
                  </small>
                </div>


                <div>
                  <span>
                    🎤
                  </span>

                  <small>
                    Voice
                  </small>
                </div>


                <div>
                  <span>
                    📺
                  </span>

                  <small>
                    Share
                  </small>
                </div>


                <div>
                  <span>
                    🎉
                  </span>

                  <small>
                    Winks
                  </small>
                </div>

              </div>

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
                <h2>Campfire Black Piano</h2>
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


      {/* ====================================================
          SETTINGS
          ==================================================== */}

      <CampfireSettingsModal
        open={
          showSettings
        }
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
                  Start a Campfire
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
                Campfire name
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


              <div className="temporaryNotice">

                🔥

                <strong>
                  Temporary Campfire
                </strong>

                <span>
                  Será apagada 5 minutos
                  depois que a última
                  pessoa sair.
                </span>

              </div>


              <label className="fieldLabel">
                Privacy
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
                  Invite friends
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


              <div className="vipHint">
                ⭐ Permanent Campfires
                estarão disponíveis
                para membros VIP.
              </div>

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
                Cancel
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
                  : "🔥 Start Campfire"}

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

  message:
    string;

  busy:
    boolean;

  externalContextRequest:
    SidebarContextRequest | null;

  onLeave:
    () => void;

  onRejoin:
    () => void;

  onAccept:
    () => void;

  onDecline:
    () => void;
};


function CampfireView({
  room,
  currentUserId,
  profileStatus,
  message,
  busy,
  externalContextRequest,
  onLeave,
  onRejoin,
  onAccept,
  onDecline,
}: CampfireViewProps) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<CampfireRoomTab>(
      "messages"
    );


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
    activeTab !== "anime" ||
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
   * começa em Mensagens e fecha
   * qualquer painel aberto.
   */

  useEffect(() => {
    setActiveTab(
      "messages"
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
        activeTab ===
        "messages",
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

        {/* ==================================================
            HEADER
            ================================================== */}

        <div className="campfireRoomHeader">

          <div className="campfireRoomIdentity">

            <div className="campfireRoomFlame">
              🔥
            </div>


            <div className="campfireRoomIdentityText">

              <h2>
                {room.name}
              </h2>


              <div>

                <b>

                  ●

                  {" "}

                  {
                    room.activePeople
                  }

                  {" "}

                  pessoa(s)

                </b>


                <span>
                  •
                </span>


                <span>

                  {privacyText(
                    room.privacy
                  )}

                </span>


                <span>
                  •
                </span>


                <span>

                  {room.persistent
                    ? "Permanent"
                    : "Temporary"}

                </span>

              </div>

            </div>

          </div>


          {/* ===============================================
              HEADER ACTIONS
              =============================================== */}

          <div className="campfireRoomHeaderActions">

            <button
              type="button"

              className="campfireMembersButton"

              title="Participantes"

              onClick={() =>
                setShowMembers(
                  true
                )
              }
            >
              👥 Participantes
            </button>


            <button
              type="button"

              className="campfireLeaveButton"

              disabled={
                busy
              }

              onClick={
                onLeave
              }
            >
              🚪 Leave
            </button>

          </div>

        </div>


        {message && (
          <div className="campfireRoomNotice">
            {message}
          </div>
        )}


        {/* ==================================================
            TABS
            ================================================== */}

        <div
          className="campfireTabs"

          role="tablist"

          aria-label="Campfire"
        >

          {/* MESSAGES */}

          <button
            type="button"

            role="tab"

            aria-selected={
              activeTab ===
              "messages"
            }

            className={
              [
                "campfireTab",

                activeTab ===
                "messages"
                  ? "active"
                  : "",

                roomEvents
                  .hasUnreadMessages
                  ? "hasUnread"
                  : "",
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                )
            }

            onClick={() =>
              openTab(
                "messages"
              )
            }
          >

            <span className="campfireTabIcon">
              💬
            </span>


            <span>
              Mensagens
            </span>


            {roomEvents
              .unreadMessages >
              0 && (
              <span className="campfireTabBadge">

                {roomEvents
                  .unreadMessages >
                99
                  ? "99+"

                  : roomEvents
                      .unreadMessages}

              </span>
            )}

          </button>


          {/* SCREEN */}

          <button
            type="button"

            role="tab"

            aria-selected={
              activeTab ===
              "screen"
            }

            className={
              activeTab ===
              "screen"
                ? "campfireTab active"
                : "campfireTab"
            }

            onClick={() =>
              openTab(
                "screen"
              )
            }
          >

            <span className="campfireTabIcon">
              🖥️
            </span>


            <span>
              Tela
            </span>


            {screenLive && (
              <span className="campfireTabLive">
                LIVE
              </span>
            )}

          </button>


          {/* ANIMES */}

          <button
            type="button"

            role="tab"

            aria-selected={
              activeTab ===
              "anime"
            }

            className={
              activeTab ===
              "anime"
                ? "campfireTab active"
                : "campfireTab"
            }

            onClick={() =>
              openTab(
                "anime"
              )
            }
          >

            <span className="campfireTabIcon">
              📺
            </span>


            <span>
              Animes
            </span>

          </button>

        </div>


        {/* ==================================================
            PANELS
            ================================================== */}

        <div className="campfireTabPanels">

          {/* =================================================
              MESSAGES
              ================================================= */}

          <section
            role="tabpanel"

            className={
              activeTab ===
              "messages"
                ? "campfireTabPanel active"
                : "campfireTabPanel"
            }
          >

            <CampfireChat
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
            />

          </section>


          {/* =================================================
              SCREEN
              ================================================= */}

          <section
            role="tabpanel"

            className={
              activeTab ===
              "screen"
                ? "campfireTabPanel active"
                : "campfireTabPanel"
            }
          >

            <CampfireScreenShare
              campfireId={
                room.id
              }

              onLiveChange={
                setScreenLive
              }
            />

          </section>


          {/* =================================================
              ANIMES
              ================================================= */}

          <section
            role="tabpanel"

            className={
              activeTab ===
              "anime"
                ? "campfireTabPanel active"
                : "campfireTabPanel"
            }
          >

            <AnimeBrowser
              campfireId={
                room.id
              }

              onWatchTogether={() =>
                openTab(
                  "screen"
                )
              }
            />

          </section>

        </div>


        {/* ==================================================
            VOICE / WEBCAM
            ================================================== */}

        <CampfireVoiceDock
          campfireId={room.id}
          voice={voice}
          members={memberSystem.members}
          currentUserId={currentUserId}
          memberSystem={memberSystem}
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
            externalContextRequest
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
    <div className="campfireInactiveCard">

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
        <p>
          Ela está vazia e poderá
          se apagar se ninguém
          retornar durante o período
          de tolerância.
        </p>
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