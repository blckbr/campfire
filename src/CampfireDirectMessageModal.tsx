import { useEffect, useRef, useState } from "react";
import type { CampfireMember } from "./useCampfireMembers";
import { useCampfireDirectMessages } from "./useCampfireDirectMessages";
import "./CampfireDirectMessageModal.css";

type Props = {
  open: boolean;
  currentUserId: string;
  target: CampfireMember | null;
  onClose: () => void;
};

function memberName(member: CampfireMember) {
  return member.username ? `@${member.username}` : "Usuário";
}

export default function CampfireDirectMessageModal({ open, currentUserId, target, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const dm = useCampfireDirectMessages(currentUserId, target?.id ?? null, open);

  useEffect(() => { if (!open) setDraft(""); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [dm.messages.length]);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, open]);

  if (!open || !target) return null;

  async function send() {
    const result = await dm.send(draft);
    if (result.ok) setDraft("");
  }

  return (
    <div className="cfDmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cfDmModal" role="dialog" aria-modal="true" aria-label={`Mensagem para ${memberName(target)}`}>
        <header>
          <div><small>MENSAGEM PRIVADA</small><h2>{memberName(target)}</h2><p>Conversa direta</p></div>
          <button onClick={onClose} aria-label="Fechar mensagem privada">✕</button>
        </header>
        <div className="cfDmMessages">
          {dm.loading && <div className="cfDmInfo">Carregando conversa…</div>}
          {!dm.loading && dm.messages.length === 0 && <div className="cfDmInfo">Nenhuma mensagem ainda.</div>}
          {dm.messages.map((message) => (
            <article key={message.id} className={message.senderId === currentUserId ? "mine" : "theirs"}>
              <strong>{message.senderId === currentUserId ? "Você" : memberName(target)}</strong>
              <p>{message.body}</p>
              <time>{new Date(message.createdAt).toLocaleString()}</time>
            </article>
          ))}
          <div ref={endRef} />
        </div>
        {dm.error && <div className="cfDmError">{dm.error}</div>}
        <div className="cfDmComposer">
          <textarea value={draft} maxLength={4000} rows={3} placeholder={`Mensagem para ${memberName(target)}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <button disabled={dm.sending || !draft.trim()} onClick={() => void send()}>{dm.sending ? "Enviando…" : "Enviar"}</button>
        </div>
      </section>
    </div>
  );
}
