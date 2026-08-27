import { useEffect, useMemo, useRef, useState } from "react";

import {
  useCampfireMembers,
  type CampfireMember,
} from "./useCampfireMembers";

import type {
  CampfirePresenceStatus,
  CampfireVoiceController,
} from "./useCampfireVoice";

import UserContextMenu from "./UserContextMenu";
import CampfireModeratorView from "./CampfireModeratorView";
import { useCampfireModeration } from "./useCampfireModeration";

import "./CampfireMembersPanel.css";


type Props = {
  open: boolean;
  campfireId: string;
  currentUserId: string;
  memberSystem: ReturnType<typeof useCampfireMembers>;
  voice: CampfireVoiceController;
  externalContextRequest?: {
    userId: string;
    x: number;
    y: number;
    nonce: number;
  } | null;
  onClose: () => void;
};


function memberNick(
  member: CampfireMember
): string {
  return member.username
    ? `@${member.username}`
    : "Usuário";
}


function memberAvatarLetter(
  member: CampfireMember
): string {
  return (
    member.username
      ?.charAt(0)
      .toUpperCase() ||
    "U"
  );
}


const STATUS_OPTIONS: ReadonlyArray<{
  value: CampfirePresenceStatus;
  label: string;
  icon: string;
}> = [
  {
    value: "online",
    label: "Online",
    icon: "●",
  },
  {
    value: "away",
    label: "Ausente",
    icon: "◐",
  },
  {
    value: "busy",
    label: "Ocupado",
    icon: "⛔",
  },
  {
    value: "offline",
    label: "Invisível",
    icon: "○",
  },
];


function statusLabel(
  status: string
): string {
  switch (status) {
    case "online":
      return "Online";

    case "away":
      return "Ausente";

    case "busy":
      return "Ocupado";

    case "offline":
      return "Offline";

    default:
      return status;
  }
}


function effectiveStatus(
  member: CampfireMember,
  voice: CampfireVoiceController
): CampfirePresenceStatus {
  const live = voice.presence[member.id];

  if (live) {
    return live.status;
  }

  return (
    member.status === "away" ||
    member.status === "busy" ||
    member.status === "offline"
  )
    ? member.status
    : "online";
}


type PresenceGroup =
  | "online"
  | "away"
  | "offline";


function presenceGroup(
  status: CampfirePresenceStatus
): PresenceGroup {
  if (status === "offline") {
    return "offline";
  }

  if (
    status === "away" ||
    status === "busy"
  ) {
    return "away";
  }

  return "online";
}


function presenceGroupLabel(
  group: PresenceGroup
): string {
  if (group === "online") {
    return "Online";
  }

  if (group === "away") {
    return "Ausentes / Ocupados";
  }

  return "Offline";
}


function presenceGroupRank(
  group: PresenceGroup
): number {
  if (group === "online") {
    return 0;
  }

  if (group === "away") {
    return 1;
  }

  return 2;
}


function roleLabel(
  role: string
): string {
  switch (role) {
    case "moderator":
      return "Moderador";

    case "presenter":
      return "Apresentador";

    default:
      return "Membro";
  }
}


function CampfireMembersPanel({
  open,
  campfireId,
  currentUserId,
  memberSystem,
  voice,
  externalContextRequest,
  onClose,
}: Props) {
  const [
    selectedMemberId,
    setSelectedMemberId,
  ] =
    useState<string | null>(
      null
    );


  const [
    confirmTransferId,
    setConfirmTransferId,
  ] =
    useState<string | null>(
      null
    );


  const [
    actionMessage,
    setActionMessage,
  ] =
    useState("");

  const [contextTargetId, setContextTargetId] = useState<string | null>(null);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  const lastExternalContextNonceRef = useRef<number | null>(null);
  const [moderatorTargetId, setModeratorTargetId] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const moderation = useCampfireModeration(
    campfireId,
    memberSystem.isCurrentUserOwner
  );


  /*
   * Quando troca de Campfire,
   * limpa a seleção anterior.
   */

  useEffect(() => {
    setSelectedMemberId(
      null
    );

    setConfirmTransferId(
      null
    );

    setActionMessage("");
    setContextTargetId(null);
    setModeratorTargetId(null);
    setStatusMenuOpen(false);
  }, [
    campfireId,
  ]);


  /*
   * Ao fechar o painel,
   * remove confirmação pendente.
   */

  useEffect(() => {
    if (!open) {
      setConfirmTransferId(
        null
      );

      setActionMessage("");
      setContextTargetId(null);
      setModeratorTargetId(null);
        setStatusMenuOpen(false);
    }
  }, [
    open,
  ]);


  useEffect(() => {
    if (!externalContextRequest) {
      return;
    }

    if (
      externalContextRequest.nonce ===
      lastExternalContextNonceRef.current
    ) {
      return;
    }

    const target =
      memberSystem.members.find(
        (member) => member.id === externalContextRequest.userId
      ) ?? null;

    if (!target) {
      return;
    }

    lastExternalContextNonceRef.current =
      externalContextRequest.nonce;

    setContextTargetId(target.id);
    setContextPosition({
      x: externalContextRequest.x,
      y: externalContextRequest.y,
    });
  }, [
    externalContextRequest,
    memberSystem.members,
  ]);

  useEffect(() => {
    if (!statusMenuOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        setStatusMenuOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    statusMenuOpen,
  ]);


  const selectedMember =
    useMemo(() => {
      if (!selectedMemberId) {
        return null;
      }

      return (
        memberSystem.members.find(
          (member) =>
            member.id ===
            selectedMemberId
        ) ?? null
      );
    }, [
      memberSystem.members,
      selectedMemberId,
    ]);


  const contextTarget =
    useMemo(() => {
      if (!contextTargetId) {
        return null;
      }

      return memberSystem.members.find(
        (member) => member.id === contextTargetId
      ) ?? null;
    }, [memberSystem.members, contextTargetId]);


  const moderatorTarget =
    useMemo(() => {
      if (!moderatorTargetId) return null;
      return memberSystem.members.find((member) => member.id === moderatorTargetId) ?? null;
    }, [memberSystem.members, moderatorTargetId]);


  const orderedMembers =
    useMemo(() => {
      return [
        ...memberSystem.members,
      ].sort((left, right) => {
        const leftGroup =
          presenceGroup(
            effectiveStatus(
              left,
              voice
            )
          );

        const rightGroup =
          presenceGroup(
            effectiveStatus(
              right,
              voice
            )
          );

        const groupDifference =
          presenceGroupRank(leftGroup) -
          presenceGroupRank(rightGroup);

        if (groupDifference !== 0) {
          return groupDifference;
        }

        return memberNick(left)
          .localeCompare(
            memberNick(right),
            "pt-BR"
          );
      });
    }, [
      memberSystem.members,
      voice.presence,
    ]);


  async function confirmTransfer(
    member: CampfireMember
  ) {
    const result =
      await memberSystem
        .transferLeadership(
          member.id
        );


    setActionMessage(
      result.message
    );


    if (result.ok) {
      setConfirmTransferId(
        null
      );

      setSelectedMemberId(
        member.id
      );
    }
  }


  return (
    <div
      className={
        open
          ? "campfireMembersOverlay"
          : "campfireMembersContextHost"
      }

      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >

      {open && (
      <aside className="campfireMembersPanel">

        {/* =================================================
            HEADER
            ================================================= */}

        <div className="campfireMembersHeader">

          <div>

            <span className="campfireMembersHeaderIcon">
              👥
            </span>


            <div>

              <h2>
                Participantes
              </h2>


              <p>
                {memberSystem.members.length}
                {" "}
                pessoa(s) na Campfire
              </p>

            </div>

          </div>


          <button
            type="button"

            className="campfireMembersClose"

            onClick={
              onClose
            }

            title="Fechar"
          >
            ✕
          </button>

        </div>


        {/* =================================================
            LÍDER ATUAL
            ================================================= */}

        {memberSystem.leader && (
          <div className="campfireLeaderCard">

            <div className="campfireLeaderCrown">
              👑
            </div>


            <div>

              <small>
                LÍDER ATUAL
              </small>


              <strong>
                {memberNick(
                  memberSystem.leader
                )}
              </strong>


              <span>
                Controla o Watch Together
              </span>

            </div>

          </div>
        )}


        {/* =================================================
            INFORMAÇÃO DO USUÁRIO ATUAL
            ================================================= */}

        <div className="campfireLeadershipInfo">

          {memberSystem.isCurrentUserLeader ? (
            <>

              <span>
                👑
              </span>


              <div>

                <strong>
                  Você está no controle
                </strong>


                <small>
                  Selecione outro membro
                  para transferir a liderança.
                </small>

              </div>

            </>
          ) : (
            <>

              <span>
                📺
              </span>


              <div>

                <strong>
                  Watch Together
                </strong>


                <small>
                  Somente o líder pode escolher
                  e controlar o que todos assistirão.
                </small>

              </div>

            </>
          )}

        </div>


        {/* =================================================
            ERRO
            ================================================= */}

        {memberSystem.error && (
          <div className="campfireMembersError">
            ⚠️ {memberSystem.error}
          </div>
        )}


        {/* =================================================
            MENSAGEM
            ================================================= */}

        {actionMessage && (
          <div className="campfireMembersMessage">
            {actionMessage}
          </div>
        )}


        {/* =================================================
            LISTA DE PARTICIPANTES
            ================================================= */}

        <div className="campfireMembersList">

          {memberSystem.loading && (
            <div className="campfireMembersLoading">
              🔥 Carregando participantes...
            </div>
          )}


          {!memberSystem.loading &&
            orderedMembers.map(
              (member, index) => {
                const nick =
                  memberNick(
                    member
                  );


                const selected =
                  selectedMemberId ===
                  member.id;


                const live =
                  voice.presence[
                    member.id
                  ];


                const liveStatus =
                  effectiveStatus(
                    member,
                    voice
                  );


                const group =
                  presenceGroup(
                    liveStatus
                  );


                const previousGroup =
                  index > 0
                    ? presenceGroup(
                        effectiveStatus(
                          orderedMembers[
                            index - 1
                          ],
                          voice
                        )
                      )
                    : null;


                const showGroupHeader =
                  group !==
                  previousGroup;


                const groupCount =
                  orderedMembers.filter(
                    (candidate) =>
                      presenceGroup(
                        effectiveStatus(
                          candidate,
                          voice
                        )
                      ) === group
                  ).length;


                return (
                  <div
                    key={
                      member.id
                    }

                    className="campfireMemberGroupWrap"
                  >
                    {showGroupHeader && (
                      <div
                        className={
                          `campfireMemberGroupHeader ${group}`
                        }
                      >
                        <span>
                          {presenceGroupLabel(
                            group
                          )}
                        </span>

                        <b>
                          {groupCount}
                        </b>
                      </div>
                    )}

                    <button
                      type="button"

                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextTargetId(member.id);
                      setContextPosition({ x: event.clientX, y: event.clientY });
                    }}

                    className={
                      selected
                        ? "campfireMemberRow selected"
                        : "campfireMemberRow"
                    }

                    onClick={() => {
                      setSelectedMemberId(
                        member.id
                      );

                      setConfirmTransferId(
                        null
                      );

                      setActionMessage("");
                    }}
                  >

                    {/* AVATAR */}

                    <div className="campfireMemberAvatar">

                      {member.avatar_url ? (
                        <img
                          src={
                            member.avatar_url
                          }

                          alt=""
                        />
                      ) : (
                        <span>
                          {memberAvatarLetter(
                            member
                          )}
                        </span>
                      )}


                      <i
                        className={
                          `campfireMemberStatus ${liveStatus}`
                        }
                      />

                    </div>


                    {/* IDENTIDADE */}

                    <div className="campfireMemberIdentity">

                      <div className="campfireMemberName">

                        {member.is_leader && (
                          <span
                            className="campfireMemberCrown"

                            title="Líder"
                          >
                            👑
                          </span>
                        )}


                        <strong>
                          {nick}
                        </strong>

                      </div>


                      <small>

                        {live?.personalMessage
                          ? `${live.personalMessage} • ${statusLabel(liveStatus)}`
                          : statusLabel(liveStatus)}

                      </small>


                      {live && (
                        <div className="campfireMemberMediaIcons">
                          {live.voiceJoined && (
                            <span title="Na voz">🎧</span>
                          )}

                          {live.hasMicrophone && (
                            <span
                              title={
                                live.voiceJoined && !live.micEnabled
                                  ? "Microfone silenciado"
                                  : "Microfone disponível"
                              }
                            >
                              {live.voiceJoined && !live.micEnabled
                                ? "🔇"
                                : "🎙"}
                            </span>
                          )}

                          {live.hasCamera && (
                            <span
                              className={
                                live.cameraEnabled
                                  ? "cameraLive"
                                  : ""
                              }
                              title={
                                live.cameraEnabled
                                  ? "Webcam ligada"
                                  : "Webcam disponível"
                              }
                            >
                              📹
                            </span>
                          )}
                        </div>
                      )}

                    </div>


                    {/* BADGES */}

                    <div className="campfireMemberBadges">

                      {member.is_leader && (
                        <span className="leaderBadge">
                          Líder
                        </span>
                      )}


                      {member.is_owner && (
                        <span className="ownerBadge">
                          Owner
                        </span>
                      )}


                      {!member.is_leader &&
                        !member.is_owner &&
                        member.role !==
                          "member" && (
                          <span className="roleBadge">

                            {roleLabel(
                              member.role
                            )}

                          </span>
                        )}

                    </div>

                    </button>
                  </div>
                );
              }
            )}

        </div>


        {/* =================================================
            MEMBRO SELECIONADO
            ================================================= */}

        {selectedMember && (
          <div className="campfireSelectedMember">

            <div className="campfireSelectedMemberTitle">

              <div>

                <strong>
                  {memberNick(
                    selectedMember
                  )}
                </strong>


                <small>

                  {selectedMember.is_leader
                    ? "👑 Líder da Campfire"

                    : selectedMember.is_owner
                      ? "Owner da Campfire"

                      : roleLabel(
                          selectedMember.role
                        )}

                </small>

              </div>

            </div>


            {/* VOCÊ */}

            {selectedMember.id ===
              currentUserId && (
              <>
                <div className="campfireMemberSelf">
                  Este é você.
                </div>

                <div className="campfirePresenceEditor">
                  <div className="campfirePresenceField">
                    <span>Status</span>

                    <div className="campfireStatusPicker">
                      <button
                        type="button"
                        className="campfireStatusPickerButton"
                        aria-haspopup="listbox"
                        aria-expanded={statusMenuOpen}
                        onClick={() =>
                          setStatusMenuOpen(
                            (value) => !value
                          )
                        }
                      >
                        <span>
                          {STATUS_OPTIONS.find(
                            (option) =>
                              option.value ===
                              voice.status
                          )?.icon ?? "●"}
                        </span>

                        <strong>
                          {STATUS_OPTIONS.find(
                            (option) =>
                              option.value ===
                              voice.status
                          )?.label ?? "Online"}
                        </strong>

                        <span
                          className="campfireStatusPickerChevron"
                          aria-hidden="true"
                        >
                          {statusMenuOpen
                            ? "⌃"
                            : "⌄"}
                        </span>
                      </button>

                      {statusMenuOpen && (
                        <div
                          className="campfireStatusPickerMenu"
                          role="listbox"
                          aria-label="Status"
                        >
                          {STATUS_OPTIONS.map(
                            (option) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={
                                  voice.status ===
                                  option.value
                                }
                                className={
                                  voice.status ===
                                  option.value
                                    ? "selected"
                                    : ""
                                }
                                key={option.value}
                                onClick={() => {
                                  setStatusMenuOpen(
                                    false
                                  );

                                  void voice.setStatus(
                                    option.value
                                  );
                                }}
                              >
                                <span>
                                  {option.icon}
                                </span>

                                <strong>
                                  {option.label}
                                </strong>

                                {voice.status ===
                                  option.value && (
                                  <span
                                    className="campfireStatusPickerCheck"
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                )}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <label>
                    <span>Mensagem pessoal</span>

                    <input
                      type="text"
                      maxLength={120}
                      value={voice.personalMessage}
                      placeholder="O que você está fazendo?"
                      onChange={(event) =>
                        void voice.setPersonalMessage(
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </>
            )}


            {selectedMember.id !== currentUserId && (
              <div className="campfireLocalVolume">
                <div>
                  <strong>🔊 Volume deste usuário</strong>
                  <small>Somente para você</small>
                </div>

                <span>
                  {voice.getUserVolume(selectedMember.id)}%
                </span>

                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={voice.getUserVolume(selectedMember.id)}
                  onChange={(event) =>
                    voice.setUserVolume(
                      selectedMember.id,
                      Number(event.target.value)
                    )
                  }
                />
              </div>
            )}


            {/* JÁ É LÍDER */}

            {selectedMember.is_leader && (
              <div className="campfireAlreadyLeader">
                👑 Esta pessoa já é o líder.
              </div>
            )}


            {/* TRANSFERIR */}

            {memberSystem.isCurrentUserLeader &&
              selectedMember.id !==
                currentUserId &&
              !selectedMember.is_leader &&
              confirmTransferId !==
                selectedMember.id && (

                <button
                  type="button"

                  className="campfireTransferButton"

                  disabled={
                    memberSystem.transferring
                  }

                  onClick={() =>
                    setConfirmTransferId(
                      selectedMember.id
                    )
                  }
                >
                  👑 Transferir liderança
                </button>
              )}


            {/* CONFIRMAÇÃO */}

            {confirmTransferId ===
              selectedMember.id && (

              <div className="campfireTransferConfirm">

                <div className="campfireTransferConfirmIcon">
                  👑
                </div>


                <strong>
                  Transferir a liderança?
                </strong>


                <p>

                  {memberNick(
                    selectedMember
                  )}

                  {" "}

                  passará a escolher e
                  controlar o Watch Together
                  desta Campfire.

                </p>


                {memberSystem.isCurrentUserOwner && (
                  <small>
                    Você continuará sendo
                    o Owner da Campfire.
                  </small>
                )}


                <div className="campfireTransferConfirmActions">

                  <button
                    type="button"

                    className="campfireTransferCancel"

                    disabled={
                      memberSystem.transferring
                    }

                    onClick={() =>
                      setConfirmTransferId(
                        null
                      )
                    }
                  >
                    Cancelar
                  </button>


                  <button
                    type="button"

                    className="campfireTransferConfirmButton"

                    disabled={
                      memberSystem.transferring
                    }

                    onClick={() =>
                      void confirmTransfer(
                        selectedMember
                      )
                    }
                  >

                    {memberSystem.transferring
                      ? "Transferindo..."
                      : "👑 Transferir"}

                  </button>

                </div>

              </div>
            )}


            {/* USUÁRIO NÃO É LÍDER */}

            {!memberSystem.isCurrentUserLeader &&
              selectedMember.id !==
                currentUserId &&
              !selectedMember.is_leader && (

                <div className="campfireTransferLocked">
                  🔒 Somente o líder atual
                  pode transferir a liderança.
                </div>
              )}

          </div>
        )}


        {/* =================================================
            FOOTER
            ================================================= */}

        <div className="campfireMembersFooter">

          <span>
            👑 Líder
          </span>


          <span>
            controla o Watch Together
          </span>

        </div>

      </aside>
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
        onModeratorView={(userId) => {
          setSelectedMemberId(userId);
          setContextTargetId(null);
          setModeratorTargetId(userId);
        }}
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


export default CampfireMembersPanel;