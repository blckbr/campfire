import { useState } from "react";
import type { ReturnTypeOfModeration } from "./UserContextMenuTypes";
import "./CampfireVoiceChannelManager.css";

type Props = {
  moderation: ReturnTypeOfModeration;
  isOwner: boolean;
};

export default function CampfireVoiceChannelManager({ moderation, isOwner }: Props) {
  const [message, setMessage] = useState("");

  async function run(result: Promise<{ ok: boolean; message: string }>) {
    const value = await result;
    setMessage(value.message);
  }

  if (!isOwner) return null;

  return (
    <section className="cfVoiceChannelManager" aria-label="Gerenciar canais de voz">
      <header>
        <div><strong>Canais de voz</strong><small>O canal Geral é permanente. Canais extras podem ser gerenciados pelo owner.</small></div>
        <button type="button" onClick={() => {
          const name = window.prompt("Nome do novo canal de voz:", "");
          if (name?.trim()) void run(moderation.createChannel(name));
        }}>+ Criar canal de voz</button>
      </header>
      <div className="cfVoiceChannelList">
        {moderation.channels.map((channel) => (
          <div key={channel.id}>
            <span><strong>{channel.name}</strong>{channel.is_default && <small>Padrão</small>}</span>
            <div>
              <button type="button" disabled={channel.is_default} onClick={() => {
                const name = window.prompt("Novo nome do canal:", channel.name);
                if (name?.trim() && name.trim() !== channel.name) void run(moderation.renameChannel(channel.id, name));
              }}>Renomear</button>
              <button className="danger" type="button" disabled={channel.is_default} onClick={() => {
                if (window.confirm(`Excluir o canal ${channel.name}? Participantes conectados serão movidos para Geral.`)) {
                  void run(moderation.deleteChannel(channel.id));
                }
              }}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
