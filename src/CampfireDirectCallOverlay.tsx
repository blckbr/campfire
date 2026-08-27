import { useEffect, useRef, useState } from "react";
import type { CampfireMember } from "./useCampfireMembers";
import type { ReturnTypeOfDirectCall } from "./CampfireDirectCallTypes";
import "./CampfireDirectCallOverlay.css";

type Props = {
  call: ReturnTypeOfDirectCall;
  members: CampfireMember[];
  currentUserId: string;
};

function memberName(member: CampfireMember | undefined): string {
  return member?.username ? `@${member.username}` : "Usuário";
}

function MediaVideo({ stream, muted, label }: { stream: MediaStream; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="cfDirectCallVideo"><video ref={ref} autoPlay playsInline muted={muted} /><span>{label}</span></div>;
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    return () => { audio.srcObject = null; };
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export default function CampfireDirectCallOverlay({ call, members, currentUserId }: Props) {
  const [message, setMessage] = useState("");
  const other = call.otherUserId ? members.find((member) => member.id === call.otherUserId) : undefined;
  const session = call.session;
  if (!session) return null;

  async function run(result: Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }) {
    const resolved = await result;
    setMessage(resolved.message);
  }

  const title = call.incoming
    ? `${memberName(other)} está ligando…`
    : call.outgoing
      ? `Chamando ${memberName(other)}…`
      : call.connecting
        ? `Conectando com ${memberName(other)}…`
        : `Em chamada com ${memberName(other)}`;

  return (
    <div className="cfDirectCallOverlay" role="dialog" aria-modal="true" aria-label="Chamada privada Campfire">
      <section className="cfDirectCallCard">
        <header>
          <div className="cfDirectCallAvatar">{other?.avatar_url ? <img src={other.avatar_url} alt="" /> : "🔥"}</div>
          <div><small>CHAMADA PRIVADA</small><h2>{title}</h2><p>Campfire Direct</p></div>
        </header>

        {call.connected && (
          <div className="cfDirectCallMedia">
            {call.remoteStream?.getVideoTracks().length ? <MediaVideo stream={call.remoteStream} muted label={memberName(other)} /> : <div className="cfDirectCallNoVideo">🎧<span>{memberName(other)}</span></div>}
            {call.localCameraStream && <MediaVideo stream={call.localCameraStream} muted label="Você" />}
            {call.remoteStream?.getAudioTracks().length ? <RemoteAudio stream={call.remoteStream} /> : null}
          </div>
        )}

        {call.incoming ? (
          <div className="cfDirectCallActions incoming">
            <button className="accept" onClick={() => void run(call.accept())}>✓ Aceitar</button>
            <button className="decline" onClick={() => void run(call.decline())}>✕ Recusar</button>
          </div>
        ) : (
          <div className="cfDirectCallActions">
            {call.connected && <button className={call.muted ? "active" : ""} onClick={() => void run(call.toggleMute())}>{call.muted ? "🔇 Ativar microfone" : "🎙 Silenciar"}</button>}
            {call.connected && <button className={call.cameraEnabled ? "active" : ""} onClick={() => void run(call.toggleCamera())}>📹 {call.cameraEnabled ? "Desativar vídeo" : "Ativar vídeo"}</button>}
            <button className="decline" onClick={() => void run(call.endCall())}>☎ Encerrar</button>
          </div>
        )}

        {(call.error || message) && <div className="cfDirectCallMessage" role="status">{call.error || message}</div>}
        <footer>Áudio e vídeo desta chamada usam LiveKit SFU. ID local: {currentUserId.slice(0, 8)}…</footer>
      </section>
    </div>
  );
}
