import { useEffect } from "react";

import type {
  CampfireMember,
} from "./useCampfireMembers";

import type {
  CampfirePresenceStatus,
  CampfireVoiceController,
} from "./useCampfireVoice";

import "./CampfireUserProfileModal.css";


type Props = {
  open: boolean;
  target: CampfireMember | null;
  voice: CampfireVoiceController;
  onClose: () => void;
};


function nickOf(
  target: CampfireMember
): string {
  return target.username
    ? `@${target.username}`
    : "Usuário";
}


function socialNameOf(
  target: CampfireMember
): string {
  return (
    target.display_name?.trim() ||
    "Não informado"
  );
}


function avatarLetter(
  target: CampfireMember
): string {
  return (
    target.username
      ?.charAt(0)
      .toUpperCase() ||
    "U"
  );
}


function statusOf(
  target: CampfireMember,
  voice: CampfireVoiceController
): CampfirePresenceStatus {
  const live =
    voice.presence[target.id];

  if (live) {
    return live.status;
  }

  return (
    target.status === "away" ||
    target.status === "busy" ||
    target.status === "offline"
  )
    ? target.status
    : "online";
}


function statusLabel(
  status: CampfirePresenceStatus
): string {
  switch (status) {
    case "away":
      return "Ausente";

    case "busy":
      return "Ocupado";

    case "offline":
      return "Invisível";

    default:
      return "Online";
  }
}


export default function CampfireUserProfileModal({
  open,
  target,
  voice,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        onClose();
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
    open,
    onClose,
  ]);


  if (!open || !target) {
    return null;
  }


  const status =
    statusOf(
      target,
      voice
    );


  return (
    <div
      className="campfireUserProfileBackdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="campfireUserProfileModal"
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${nickOf(target)}`}
      >
        <button
          type="button"
          className="campfireUserProfileClose"
          aria-label="Fechar perfil"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="campfireUserProfileAvatar">
          {target.avatar_url ? (
            <img
              src={target.avatar_url}
              alt=""
            />
          ) : (
            <span>
              {avatarLetter(
                target
              )}
            </span>
          )}

          <i
            className={
              `campfireUserProfilePresence ${status}`
            }
          />
        </div>

        <strong className="campfireUserProfileNick">
          {nickOf(
            target
          )}
        </strong>

        <div className="campfireUserProfileSocial">
          <span>
            Nome social
          </span>

          <strong>
            {socialNameOf(
              target
            )}
          </strong>
        </div>

        <div className="campfireUserProfileMeta">
          <span>
            {statusLabel(
              status
            )}
          </span>

          {target.is_owner && (
            <span>
              Owner
            </span>
          )}

          {target.is_leader && (
            <span>
              Líder
            </span>
          )}

          {target.role &&
            target.role !== "member" && (
            <span>
              {target.role}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
