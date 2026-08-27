import { useEffect, useState } from "react";
import { buildCampfireSafetyNumber } from "./campfireIdentity";
import type { CampfireMember } from "./useCampfireMembers";
import "./CampfireVerificationModal.css";

type Props = {
  open: boolean;
  currentUserId: string;
  target: CampfireMember | null;
  onClose: () => void;
};

function nameOf(member: CampfireMember): string {
  return member.username ? `@${member.username}` : "Usuário";
}

export default function CampfireVerificationModal({ open, currentUserId, target, onClose }: Props) {
  const [code, setCode] = useState("");
  const [localFingerprint, setLocalFingerprint] = useState("");
  const [remoteFingerprint, setRemoteFingerprint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    setLoading(true); setError(""); setCode("");
    void buildCampfireSafetyNumber(currentUserId, target.id)
      .then((value) => {
        if (cancelled) return;
        setCode(value.code);
        setLocalFingerprint(value.local.fingerprint);
        setRemoteFingerprint(value.remote.fingerprint);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUserId, open, target?.id]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !target) return null;

  return (
    <div className="cfVerificationBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cfVerificationModal" role="dialog" aria-modal="true" aria-label={`Código de verificação com ${nameOf(target)}`}>
        <header>
          <div><small>IDENTIDADE CAMPFIRE</small><h2>Código de Verificação</h2><p>{nameOf(target)}</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="cfVerificationBody">
          <p>Compare este código com o que aparece no Campfire da outra pessoa. Se os dois códigos forem iguais, as chaves públicas de identidade das duas contas coincidem.</p>
          {loading && <div className="cfVerificationInfo">Gerando código com SHA-256…</div>}
          {error && <div className="cfVerificationError">{error}</div>}
          {code && <code className="cfVerificationCode">{code}</code>}
          {code && <details><summary>Fingerprints individuais</summary><div><b>Sua chave</b><code>{localFingerprint}</code><b>Chave de {nameOf(target)}</b><code>{remoteFingerprint}</code></div></details>}
          <div className="cfVerificationWarning"><strong>Importante</strong><span>Este código verifica a continuidade da chave de identidade da conta. Ele não afirma que o chat comum da Campfire é criptografado de ponta a ponta.</span></div>
        </div>
      </section>
    </div>
  );
}
