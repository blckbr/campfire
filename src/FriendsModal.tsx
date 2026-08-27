import {
  useEffect,
  useState,
} from "react";

import type {
  FriendActionResult,
  FriendItem,
  FriendRequestItem,
  PublicProfile,
} from "./useFriendships";

import "./FriendsModal.css";

export type FriendsModalTab =
  | "add"
  | "requests"
  | "friends";

type Props = {
  open: boolean;

  initialTab:
    FriendsModalTab;

  currentUsername:
    string;

  loading: boolean;

  error: string;

  friends:
    FriendItem[];

  incomingRequests:
    FriendRequestItem[];

  outgoingRequests:
    FriendRequestItem[];

  onClose: () => void;

  onRefresh:
    () => Promise<void>;

  onSendRequest:
    (
      username: string
    ) => Promise<FriendActionResult>;

  onRespondRequest:
    (
      friendshipId:
        string,

      accept:
        boolean
    ) => Promise<FriendActionResult>;

  onCancelRequest:
    (
      friendshipId:
        string
    ) => Promise<FriendActionResult>;

  onRemoveFriend:
    (
      friendshipId:
        string
    ) => Promise<FriendActionResult>;
};

function profileName(
  profile:
    PublicProfile
) {
  return (
    profile.display_name ||
    profile.username ||
    "Campfire User"
  );
}

function profileStatus(
  profile:
    PublicProfile
) {
  if (
    profile.status ===
    "offline"
  ) {
    return "Offline";
  }

  if (
    profile.status ===
    "away"
  ) {
    return "Ausente";
  }

  if (
    profile.status ===
    "busy"
  ) {
    return "Ocupado";
  }

  return "Online";
}

function avatarLetter(
  profile:
    PublicProfile
) {
  return profileName(
    profile
  )
    .charAt(0)
    .toUpperCase();
}

function FriendsModal({
  open,
  initialTab,
  currentUsername,

  loading,
  error,

  friends,
  incomingRequests,
  outgoingRequests,

  onClose,
  onRefresh,

  onSendRequest,
  onRespondRequest,
  onCancelRequest,
  onRemoveFriend,
}: Props) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<FriendsModalTab>(
      initialTab
    );

  const [
    username,
    setUsername,
  ] =
    useState("");

  const [
    actionKey,
    setActionKey,
  ] =
    useState("");

  const [
    result,
    setResult,
  ] =
    useState<FriendActionResult | null>(
      null
    );

  /*
   * Sempre que abrir,
   * respeita a aba escolhida.
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(
      initialTab
    );

    setResult(null);
  }, [
    open,
    initialTab,
  ]);

  if (!open) {
    return null;
  }

  async function runAction(
    key: string,
    action:
      () =>
        Promise<FriendActionResult>
  ) {
    setActionKey(
      key
    );

    setResult(null);

    try {
      const response =
        await action();

      setResult(
        response
      );

      return response;
    } finally {
      setActionKey("");
    }
  }

  async function send() {
    const response =
      await runAction(
        "send",
        () =>
          onSendRequest(
            username
          )
      );

    if (response.ok) {
      setUsername("");
    }
  }

  return (
    <div
      className="friendsModalOverlay"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div className="friendsModal">
        <div className="friendsModalHeader">
          <div>
            <span className="friendsModalIcon">
              👥
            </span>

            <div>
              <strong>
                Friends
              </strong>

              <small>
                @{currentUsername}
              </small>
            </div>
          </div>

          <button
            className="friendsModalClose"
            onClick={
              onClose
            }
          >
            ✕
          </button>
        </div>

        <div className="friendsTabs">
          <button
            className={
              activeTab ===
              "add"
                ? "active"
                : ""
            }
            onClick={() => {
              setActiveTab(
                "add"
              );

              setResult(
                null
              );
            }}
          >
            👤+ Adicionar
          </button>

          <button
            className={
              activeTab ===
              "requests"
                ? "active"
                : ""
            }
            onClick={() => {
              setActiveTab(
                "requests"
              );

              setResult(
                null
              );
            }}
          >
            🔔 Pedidos

            {incomingRequests.length >
              0 && (
              <span className="friendsTabBadge">
                {
                  incomingRequests.length
                }
              </span>
            )}
          </button>

          <button
            className={
              activeTab ===
              "friends"
                ? "active"
                : ""
            }
            onClick={() => {
              setActiveTab(
                "friends"
              );

              setResult(
                null
              );
            }}
          >
            👥 Amigos
          </button>
        </div>

        <div className="friendsModalBody">
          {result && (
            <div
              className={
                result.ok
                  ? "friendsResult success"
                  : "friendsResult error"
              }
            >
              {result.message}
            </div>
          )}

          {error && (
            <div className="friendsResult error">
              {error}
            </div>
          )}

          {/* ===============================================
              ADICIONAR
              =============================================== */}

          {activeTab ===
            "add" && (
            <div className="addFriendArea">
              <div className="friendsSectionIntro">
                <h3>
                  Adicionar amigo
                </h3>

                <p>
                  Digite o username
                  exato da pessoa.
                </p>
              </div>

              <label className="friendUsernameLabel">
                Username
              </label>

              <div className="friendUsernameInput">
                <span>
                  @
                </span>

                <input
                  value={
                    username
                  }
                  maxLength={
                    24
                  }
                  autoFocus
                  spellCheck={
                    false
                  }
                  placeholder="username"
                  onChange={(
                    event
                  ) => {
                    const value =
                      event.target
                        .value
                        .toLowerCase()
                        .replace(
                          /^@+/,
                          ""
                        )
                        .replace(
                          /[^a-z0-9_]/g,
                          ""
                        );

                    setUsername(
                      value
                    );

                    setResult(
                      null
                    );
                  }}
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      void send();
                    }
                  }}
                />
              </div>

              <button
                className="sendFriendButton"
                disabled={
                  username.length <
                    3 ||
                  actionKey ===
                    "send"
                }
                onClick={() =>
                  void send()
                }
              >
                {actionKey ===
                "send"
                  ? "Enviando..."
                  : "🔥 Enviar pedido"}
              </button>

              <div className="friendTip">
                Seus amigos podem
                encontrar você como{" "}
                <strong>
                  @{currentUsername}
                </strong>
                .
              </div>
            </div>
          )}

          {/* ===============================================
              PEDIDOS
              =============================================== */}

          {activeTab ===
            "requests" && (
            <div>
              <div className="friendsSectionTitle">
                <strong>
                  Recebidos
                </strong>

                <span>
                  {
                    incomingRequests.length
                  }
                </span>
              </div>

              {incomingRequests.length ===
              0 ? (
                <EmptyFriends
                  icon="🔥"
                  text="Nenhum pedido novo."
                />
              ) : (
                <div className="friendRows">
                  {incomingRequests.map(
                    (
                      request
                    ) => (
                      <div
                        className="friendManageRow"
                        key={
                          request.friendshipId
                        }
                      >
                        <ProfileAvatar
                          profile={
                            request.profile
                          }
                        />

                        <div className="friendManageIdentity">
                          <strong>
                            {profileName(
                              request.profile
                            )}
                          </strong>

                          <small>
                            @
                            {
                              request.profile
                                .username
                            }
                          </small>
                        </div>

                        <div className="friendRequestActions">
                          <button
                            className="acceptFriendButton"
                            disabled={
                              actionKey !==
                              ""
                            }
                            onClick={() =>
                              void runAction(
                                `accept-${request.friendshipId}`,
                                () =>
                                  onRespondRequest(
                                    request.friendshipId,
                                    true
                                  )
                              )
                            }
                          >
                            {actionKey ===
                            `accept-${request.friendshipId}`
                              ? "..."
                              : "✓"}
                          </button>

                          <button
                            className="declineFriendButton"
                            disabled={
                              actionKey !==
                              ""
                            }
                            onClick={() =>
                              void runAction(
                                `decline-${request.friendshipId}`,
                                () =>
                                  onRespondRequest(
                                    request.friendshipId,
                                    false
                                  )
                              )
                            }
                          >
                            {actionKey ===
                            `decline-${request.friendshipId}`
                              ? "..."
                              : "✕"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              <div className="friendsSectionTitle outgoingTitle">
                <strong>
                  Enviados
                </strong>

                <span>
                  {
                    outgoingRequests.length
                  }
                </span>
              </div>

              {outgoingRequests.length ===
              0 ? (
                <EmptyFriends
                  icon="📨"
                  text="Nenhum pedido aguardando."
                />
              ) : (
                <div className="friendRows">
                  {outgoingRequests.map(
                    (
                      request
                    ) => (
                      <div
                        className="friendManageRow"
                        key={
                          request.friendshipId
                        }
                      >
                        <ProfileAvatar
                          profile={
                            request.profile
                          }
                        />

                        <div className="friendManageIdentity">
                          <strong>
                            {profileName(
                              request.profile
                            )}
                          </strong>

                          <small>
                            @
                            {
                              request.profile
                                .username
                            }
                          </small>
                        </div>

                        <div className="pendingText">
                          Pendente
                        </div>

                        <button
                          className="cancelRequestButton"
                          disabled={
                            actionKey !==
                            ""
                          }
                          onClick={() =>
                            void runAction(
                              `cancel-${request.friendshipId}`,
                              () =>
                                onCancelRequest(
                                  request.friendshipId
                                )
                            )
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===============================================
              AMIGOS
              =============================================== */}

          {activeTab ===
            "friends" && (
            <div>
              <div className="friendsSectionTitle">
                <strong>
                  Meus amigos
                </strong>

                <span>
                  {
                    friends.length
                  }
                </span>
              </div>

              {loading ? (
                <EmptyFriends
                  icon="🔥"
                  text="Carregando amigos..."
                />
              ) : friends.length ===
                0 ? (
                <EmptyFriends
                  icon="👥"
                  text="Você ainda não adicionou ninguém."
                />
              ) : (
                <div className="friendRows">
                  {friends.map(
                    (
                      friend
                    ) => (
                      <div
                        className="friendManageRow"
                        key={
                          friend.friendshipId
                        }
                      >
                        <ProfileAvatar
                          profile={
                            friend.profile
                          }
                        />

                        <div className="friendManageIdentity">
                          <strong>
                            {profileName(
                              friend.profile
                            )}
                          </strong>

                          <small>
                            @
                            {
                              friend.profile
                                .username
                            }{" "}
                            •{" "}
                            {profileStatus(
                              friend.profile
                            )}
                          </small>
                        </div>

                        <button
                          className="removeFriendButton"
                          disabled={
                            actionKey !==
                            ""
                          }
                          onClick={() => {
                            const name =
                              profileName(
                                friend.profile
                              );

                            if (
                              !window.confirm(
                                `Remover ${name} da sua lista de amigos?`
                              )
                            ) {
                              return;
                            }

                            void runAction(
                              `remove-${friend.friendshipId}`,
                              () =>
                                onRemoveFriend(
                                  friend.friendshipId
                                )
                            );
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}

              <button
                className="friendsRefreshButton"
                onClick={() =>
                  void onRefresh()
                }
              >
                ↻ Atualizar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileAvatar({
  profile,
}: {
  profile:
    PublicProfile;
}) {
  if (
    profile.avatar_url
  ) {
    return (
      <div
        className="friendManageAvatar"
        style={{
          backgroundImage:
            `url("${profile.avatar_url}")`,
        }}
      />
    );
  }

  return (
    <div className="friendManageAvatar fallback">
      {avatarLetter(
        profile
      )}
    </div>
  );
}

function EmptyFriends({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) {
  return (
    <div className="friendsEmpty">
      <span>
        {icon}
      </span>

      <small>
        {text}
      </small>
    </div>
  );
}

export default FriendsModal;