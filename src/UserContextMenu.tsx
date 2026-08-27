import { useEffect, useMemo, useRef, useState } from "react";
import type { CampfireMember } from "./useCampfireMembers";
import type { CampfireVoiceController } from "./useCampfireVoice";
import type { ReturnTypeOfModeration } from "./UserContextMenuTypes";
import { useCampfireUserActions, type InviteableCampfire } from "./useCampfireUserActions";
import { setCampfireNativeOverlayBlock } from "./campfireNativeOverlay";
import "./UserContextMenu.css";

export type UserContextMenuPosition = { x: number; y: number };

type Props = {
  open: boolean;
  position: UserContextMenuPosition;
  campfireId: string;
  currentUserId: string;
  target: CampfireMember | null;
  isCurrentUserOwner: boolean;
  voice: CampfireVoiceController;
  moderation: ReturnTypeOfModeration;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  onMention?: (userId: string) => void;
  onMessage?: (userId: string) => void;
  onStartCall?: (userId: string) => void;
  onShowVerification?: (userId: string) => void;
  onModeratorView?: (userId: string) => void;
  onTransferOwnership?: (userId: string) => Promise<{ ok: boolean; message: string }>;
};

function userNick(member: CampfireMember): string {
  return member.username ? `@${member.username}` : "Usuário";
}

function socialName(member: CampfireMember): string {
  return member.display_name || "";
}

function friendshipLabel(state: string | undefined): string {
  if (state === "friends") return "Desfazer amizade";
  if (state === "outgoing") return "Cancelar pedido de amizade";
  if (state === "incoming") return "Aceitar amizade";
  return "Adicionar amizade";
}

export default function UserContextMenu({
  open, position, campfireId, currentUserId, target, isCurrentUserOwner,
  voice, moderation, onClose, onOpenProfile, onMention, onMessage, onStartCall,
  onShowVerification, onModeratorView, onTransferOwnership,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const userActions = useCampfireUserActions(currentUserId);
  const [message, setMessage] = useState("");
  const [coords, setCoords] = useState(position);
  const [roleOpen, setRoleOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteableCampfires, setInviteableCampfires] = useState<InviteableCampfire[]>([]);
  const settings = target ? userActions.cache[target.id] : undefined;
  const self = target?.id === currentUserId;

  useEffect(() => {
    const source = `user-context-menu:${campfireId}`;
    setCampfireNativeOverlayBlock(source, open);

    return () => {
      setCampfireNativeOverlayBlock(source, false);
    };
  }, [campfireId, open]);

  useEffect(() => {
    if (!open || !target) return;
    setMessage("");
    setRoleOpen(false); setMoveOpen(false); setInviteOpen(false); setInviteableCampfires([]);
    void userActions.load(target.id);
  }, [open, target?.id]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      const menu = menuRef.current;
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
      ).filter((item) => item.offsetParent !== null);
      if (items.length === 0) return;
      const current = document.activeElement as HTMLButtonElement | null;
      const index = Math.max(0, items.indexOf(current ?? items[0]));
      let nextIndex = -1;
      if (event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
      if (event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = items.length - 1;
      if (nextIndex >= 0) {
        event.preventDefault();
        items[nextIndex]?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      setCoords({
        x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)),
        y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, position.x, position.y, roleOpen, moveOpen, inviteOpen]);

  const state = target ? moderation.states[target.id] : undefined;
  const volume = target ? voice.getUserVolume(target.id) : 100;
  const normalActions = useMemo(() => target ? true : false, [target]);
  if (!open || !target || !normalActions) return null;
  const targetUserId = target.id;

  async function run(result: Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }) {
    const resolved = await result;
    setMessage(resolved.message);
  }

  const event = (name: string) => {
    window.dispatchEvent(new CustomEvent(name, {
      detail: {
        campfireId,
        userId: target.id,
        username: target.username,
        displayName: socialName(target),
      },
    }));
  };

  function dispatchAndClose(name: string, callback?: (userId: string) => void) {
    callback?.(targetUserId);
    onClose();
    event(name);
  }

  async function openInviteMenu() {
    const next = !inviteOpen;
    setInviteOpen(next);
    setRoleOpen(false); setMoveOpen(false);
    if (next && inviteableCampfires.length === 0) {
      setInviteableCampfires(await userActions.loadInviteableCampfires(campfireId));
    }
  }

  return (
    <div className="cfUserContextBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={menuRef} className="cfUserContextMenu" role="menu" style={{ left: coords.x, top: coords.y }}>
        <div className="cfUserContextHeader">
          <strong>{userNick(target)}</strong>
          <small>Perfil e ações do usuário</small>
        </div>
        {self && (
          <div className="cfUserContextSelfNotice">
            Você selecionou seu próprio usuário. As ações que exigem outro participante ficam indisponíveis.
          </div>
        )}
        {message && <div className="cfUserContextMessage" role="status" aria-live="polite">{message}</div>}

        <button onClick={() => dispatchAndClose("campfire-open-profile", onOpenProfile)}>Perfil</button>
        <button disabled={self} onClick={() => dispatchAndClose("campfire-mention-user", onMention)}>Mencionar</button>
        <button disabled={self} onClick={() => dispatchAndClose("campfire-open-direct-message", onMessage)}>Mensagem</button>
        <button disabled={self} onClick={() => dispatchAndClose("campfire-start-direct-call", onStartCall)}>Iniciar chamada</button>

        <button disabled={self} onClick={() => {
          const value = window.prompt("Nota privada — visível apenas para você:", settings?.note ?? "");
          if (value !== null) void run(userActions.updatePrivate(target.id, { note: value }));
        }}>Adicionar nota<small>Visível apenas para você</small></button>
        <button disabled={self} onClick={() => {
          const value = window.prompt("Apelido privado para este amigo:", settings?.alias ?? "");
          if (value !== null) void run(userActions.updatePrivate(target.id, { alias: value }));
        }}>Adicionar apelido de amigo</button>

        <div className="cfUserVolume" role="group" aria-label="Volume do usuário">
          <span>Volume do usuário <b>{volume}%</b></span>
          <input disabled={self} aria-label="Volume do usuário" type="range" min="0" max="200" step="5" value={volume}
            onChange={(e) => voice.setUserVolume(target.id, Number(e.target.value))} />
        </div>

        <button disabled={self} role="menuitemcheckbox" aria-checked={volume === 0}
          onClick={() => voice.setUserVolume(target.id, volume === 0 ? 100 : 0)}>Silenciar <span>{volume === 0 ? "☑" : "☐"}</span></button>
        <button disabled={self} role="menuitemcheckbox" aria-checked={settings?.effectsMuted === true}
          onClick={() => void run(userActions.setEffectsMuted(target.id, !(settings?.effectsMuted === true)))}>
          Silenciar efeitos sonoros <span>{settings?.effectsMuted ? "☑" : "☐"}</span>
        </button>
        <button disabled={self} role="menuitemcheckbox" aria-checked={settings?.videoHidden === true}
          onClick={() => void run(userActions.setVideoHidden(target.id, !(settings?.videoHidden === true)))}>
          Desativar vídeo <span>{settings?.videoHidden ? "☑" : "☐"}</span>
        </button>
        <button disabled={self} onClick={() => dispatchAndClose("campfire-show-verification-code", onShowVerification)}>Ver Código de Verificação</button>
        <button onClick={() => setMessage("Nenhum app disponível.")}>Apps <span>›</span></button>

        <button disabled={self} onClick={() => void openInviteMenu()}>Convidar para Campfire <span>{inviteOpen ? "⌃" : "›"}</span></button>
        {inviteOpen && <div className="cfUserContextSubmenu" role="group" aria-label="Campfires disponíveis">
          {inviteableCampfires.length === 0
            ? <small>Nenhuma outra Campfire ativa disponível.</small>
            : inviteableCampfires.map((room) => (
              <button key={room.id} onClick={() => void run(userActions.inviteToCampfire(room.id, target.id))}>{room.name}</button>
            ))}
        </div>}

        <button disabled={self} onClick={() => void run(userActions.toggleFriendship(target.id, target.username))}>
          {friendshipLabel(settings?.friendshipState)}
        </button>
        <button disabled={self} role="menuitemcheckbox" aria-checked={settings?.ignored === true}
          onClick={() => void run(userActions.updatePrivate(target.id, { ignored: !(settings?.ignored === true) }))}>Ignorar <span>{settings?.ignored ? "☑" : "☐"}</span></button>
        <button disabled={self} className="danger" onClick={() => void run(userActions.setBlocked(target.id, !(settings?.blocked === true)))}>
          {settings?.blocked ? "Desbloquear" : "Bloquear"}
        </button>

        {isCurrentUserOwner && <>
          <div className="cfUserContextSeparator" />
          <button disabled={self} onClick={() => { setRoleOpen((value) => !value); setMoveOpen(false); setInviteOpen(false); }}>Cargo <span>{roleOpen ? "⌃" : "›"}</span></button>
          {roleOpen && <div className="cfUserContextSubmenu" role="group" aria-label="Cargo do membro">
            <button onClick={() => void run(moderation.setRole(target.id, "member"))}>Membro</button>
            <button onClick={() => void run(moderation.setRole(target.id, "moderator"))}>Moderador <small>sem poderes de owner</small></button>
            <button onClick={() => void run(moderation.setRole(target.id, "presenter"))}>Apresentador</button>
          </div>}
          <button disabled={self} onClick={() => { setMoveOpen((value) => !value); setRoleOpen(false); setInviteOpen(false); }}>Mover para <span>{moveOpen ? "⌃" : "›"}</span></button>
          {moveOpen && <div className="cfUserContextSubmenu" role="group" aria-label="Mover para canal de voz">
            {moderation.channels.map((channel) => (
              <button key={channel.id} onClick={() => void run(moderation.moveTo(target.id, channel.id))}>{channel.name}</button>
            ))}
          </div>}
          <button disabled={self} onClick={() => dispatchAndClose("campfire-open-moderator-view", onModeratorView)}>Abrir na visualização de moderador</button>
          <button disabled={self} className="adminDanger" role="menuitemcheckbox" aria-checked={state?.room_voice_muted === true}
            onClick={() => void run(moderation.setFlags(target.id, { room_voice_muted: !(state?.room_voice_muted === true) }))}>
            Silenciar voz na sala <span>{state?.room_voice_muted ? "☑" : "☐"}</span>
          </button>
          <button disabled={self} className="adminDanger" role="menuitemcheckbox" aria-checked={state?.room_deafened === true}
            onClick={() => void run(moderation.setFlags(target.id, { room_deafened: !(state?.room_deafened === true) }))}>
            Desativar áudio na sala <span>{state?.room_deafened ? "☑" : "☐"}</span>
          </button>
          <button disabled={self} className="adminDanger" onClick={() => void run(moderation.disconnect(target.id))}>Desconectar</button>
          <button disabled={self} className="adminDanger" onClick={() => {
            if (!onTransferOwnership) return;
            if (window.confirm(`Transferir a propriedade desta Campfire para ${userNick(target)}? Você perderá as ações administrativas.`)) {
              void run(onTransferOwnership(target.id));
            }
          }}>Transferir propriedade</button>
        </>}

        <div className="cfUserContextSeparator" />
        <button onClick={() => void run(userActions.copyUserId(target.id))}>▣ Copiar ID do usuário</button>
      </div>
    </div>
  );
}
