import { useMemo, useState } from "react";
import type { CampfireMember } from "./useCampfireMembers";
import type { ReturnTypeOfModeration } from "./UserContextMenuTypes";
import "./CampfireModeratorView.css";

type Props = {
  open: boolean;
  target: CampfireMember | null;
  moderation: ReturnTypeOfModeration;
  onClose: () => void;
};

function nameOf(member: CampfireMember) {
  return member.username ? `@${member.username}` : "Usuário";
}

export default function CampfireModeratorView({ open, target, moderation, onClose }: Props) {
  const [message, setMessage] = useState("");
  const state = target ? moderation.states[target.id] : undefined;
  const selectedChannelId = state?.voice_channel_id
    ?? moderation.channels.find((channel) => channel.is_default)?.id
    ?? "";

  const channelName = useMemo(
    () => moderation.channels.find((channel) => channel.id === selectedChannelId)?.name ?? "Geral",
    [moderation.channels, selectedChannelId]
  );

  if (!open || !target) return null;

  async function run(result: Promise<{ ok: boolean; message: string }>) {
    const value = await result;
    setMessage(value.message);
  }

  return (
    <div className="cfModeratorBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="cfModeratorView" role="dialog" aria-modal="true" aria-label={`Moderação de ${nameOf(target)}`}>
        <header>
          <div>
            <small>VISUALIZAÇÃO DE MODERADOR</small>
            <h2>{nameOf(target)}</h2>
            <p>Administração da Campfire</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar visualização de moderador">✕</button>
        </header>

        <div className="cfModeratorStatus">
          <span>Canal de voz atual</span>
          <strong>{channelName}</strong>
        </div>

        <div className="cfModeratorMetadata">
          <div><span>Cargo</span><strong>{target.role || "member"}</strong></div>
          <div><span>Entrou na Campfire</span><strong>{target.joined_at ? new Date(target.joined_at).toLocaleString("pt-BR") : "—"}</strong></div>
          <div><span>ID do usuário</span><strong>{target.id}</strong></div>
        </div>

        <div className="cfModeratorControls">
          <label>
            <span><strong>Silenciar voz na sala</strong><small>Impede o microfone deste usuário para todos.</small></span>
            <input type="checkbox" checked={state?.room_voice_muted === true}
              onChange={(event) => void run(moderation.setFlags(target.id, { room_voice_muted: event.target.checked }))} />
          </label>

          <label>
            <span><strong>Desativar áudio na sala</strong><small>Impede este usuário de ouvir a mídia da sala.</small></span>
            <input type="checkbox" checked={state?.room_deafened === true}
              onChange={(event) => void run(moderation.setFlags(target.id, { room_deafened: event.target.checked }))} />
          </label>

          <label>
            <span><strong>Desativar vídeo na sala</strong><small>Bloqueia a publicação da webcam.</small></span>
            <input type="checkbox" checked={state?.room_video_disabled === true}
              onChange={(event) => void run(moderation.setFlags(target.id, { room_video_disabled: event.target.checked }))} />
          </label>

          <label>
            <span><strong>Impedir compartilhamento</strong><small>Bloqueia tela e Watch Together publicados por este usuário.</small></span>
            <input type="checkbox" checked={state?.room_screen_disabled === true}
              onChange={(event) => void run(moderation.setFlags(target.id, { room_screen_disabled: event.target.checked }))} />
          </label>
        </div>

        <div className="cfModeratorMove">
          <label htmlFor="cfModeratorVoiceChannel">Mover para</label>
          <select id="cfModeratorVoiceChannel" value={selectedChannelId}
            onChange={(event) => {
              if (event.target.value) void run(moderation.moveTo(target.id, event.target.value));
            }}>
            {moderation.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
          </select>
        </div>

        <button className="cfModeratorDisconnect" type="button"
          onClick={() => void run(moderation.disconnect(target.id))}>
          Desconectar da voz
        </button>

        <div className="cfModeratorHistory">
          <h3>Histórico de moderação</h3>
          {moderation.logs.filter((entry) => !entry.target_user_id || entry.target_user_id === target.id).length === 0
            ? <p>Nenhuma ação registrada para este usuário.</p>
            : <ul>
              {moderation.logs
                .filter((entry) => !entry.target_user_id || entry.target_user_id === target.id)
                .slice(0, 20)
                .map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.action}</strong>
                    <span>{new Date(entry.created_at).toLocaleString("pt-BR")}</span>
                  </li>
                ))}
            </ul>}
        </div>

        <div className="cfModeratorDangerZone">
          <h3>Moderação da Campfire</h3>
          <p>Estas ações alteram a participação do usuário na sala. Apenas o owner pode executá-las.</p>
          <button type="button" onClick={() => {
            if (window.confirm(`Expulsar ${nameOf(target)} desta Campfire? A pessoa poderá entrar novamente se ainda tiver acesso.`)) {
              void run(moderation.kick(target.id));
            }
          }}>Expulsar da Campfire</button>
          <button className="danger" type="button" onClick={() => {
            const reason = window.prompt(`Motivo do banimento de ${nameOf(target)} (opcional):`, "");
            if (reason === null) return;
            if (window.confirm(`Banir ${nameOf(target)} desta Campfire? O usuário não poderá reativar a participação enquanto o ban existir.`)) {
              void run(moderation.ban(target.id, reason));
            }
          }}>Banir da Campfire</button>
        </div>

        {message && <div className="cfModeratorMessage" role="status">{message}</div>}
      </section>
    </div>
  );
}
