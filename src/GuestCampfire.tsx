import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { sha256Hex } from "./web/platform";
import { useCampfireVoice } from "./useCampfireVoice";
import CampfireScreenShare from "./CampfireScreenShare";
import "./GuestCampfire.css";

type InviteInfo = {
  campfire_id: string;
  campfire_name: string;
  active_people: number;
  allow_guest_watch_start: boolean;
};

type GuestSession = {
  guest_session_id: string;
  campfire_id: string;
  campfire_name: string;
  display_name: string;
  allow_guest_watch_start: boolean;
};

type GuestMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_display_name: string | null;
  message_type: string;
  media_path?: string | null;
  media_duration_ms?: number | null;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir esta ação.";
}

export default function GuestCampfire({ token }: { token: string }) {
  const [tokenHash, setTokenHash] = useState("");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showScreen, setShowScreen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  const voice = useCampfireVoice(guest?.campfire_id ?? "", userId, "online", Boolean(guest && userId));

  const loadMessages = useCallback(async () => {
    if (!guest) return;
    const { data, error: rpcError } = await supabase.rpc("get_campfire_web_messages", {
      p_campfire_id: guest.campfire_id,
      p_limit: 100,
    });
    if (rpcError) throw rpcError;
    const rows = (data ?? []) as GuestMessage[];
    setMessages(rows);

    const paths = rows.flatMap((message) => message.message_type === "audio" && message.media_path ? [message.media_path] : []);
    if (paths.length) {
      const { data: signed, error: signedError } = await supabase.storage.from("campfire-audio").createSignedUrls(paths, 3600);
      if (!signedError) {
        const next: Record<string, string> = {};
        for (const item of signed ?? []) {
          if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
        }
        setAudioUrls(next);
      }
    } else {
      setAudioUrls({});
    }
  }, [guest]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const hash = await sha256Hex(token);
        if (cancelled) return;
        setTokenHash(hash);
        const { data, error: inviteError } = await supabase.rpc("resolve_campfire_web_invite", {
          p_token_hash: hash,
        });
        if (inviteError) throw inviteError;
        const row = Array.isArray(data) ? data[0] : null;
        if (!row) throw new Error("Este convite não existe, expirou ou já atingiu o limite de usos.");
        if (!cancelled) setInvite(row as InviteInfo);
      } catch (inviteError) {
        if (!cancelled) setError(messageOf(inviteError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const enterAsGuest = useCallback(async () => {
    const name = displayName.trim();
    if (!tokenHash || !invite || !name) return;
    setJoining(true);
    setError("");
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const anonymous = await supabase.auth.signInAnonymously();
        if (anonymous.error) throw anonymous.error;
        sessionData = { session: anonymous.data.session };
      }
      const principal = sessionData.session?.user.id;
      if (!principal) throw new Error("Não foi possível abrir uma sessão segura de convidado.");

      const { data, error: enterError } = await supabase.rpc("enter_campfire_as_guest", {
        p_token_hash: tokenHash,
        p_display_name: name,
      });
      if (enterError) throw enterError;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) throw new Error("O servidor não retornou a sessão do convidado.");
      setUserId(principal);
      setGuest(row as GuestSession);
    } catch (joinError) {
      setError(messageOf(joinError));
    } finally {
      setJoining(false);
    }
  }, [displayName, invite, tokenHash]);

  useEffect(() => {
    if (!guest) return;
    void loadMessages().catch((loadError) => setError(messageOf(loadError)));

    let channel: RealtimeChannel | null = supabase
      .channel(`campfire-web-guest-chat:${guest.campfire_id}:${guest.guest_session_id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "campfire_messages",
        filter: `campfire_id=eq.${guest.campfire_id}`,
      }, () => { void loadMessages(); })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "campfire_guest_messages",
        filter: `campfire_id=eq.${guest.campfire_id}`,
      }, () => { void loadMessages(); })
      .subscribe();

    const heartbeat = window.setInterval(() => {
      void supabase.rpc("heartbeat_campfire_guest", {
        p_guest_session_id: guest.guest_session_id,
      });
    }, 20_000);

    const leave = () => {
      void supabase.rpc("leave_campfire_guest", {
        p_guest_session_id: guest.guest_session_id,
      });
    };
    window.addEventListener("pagehide", leave);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [guest, loadMessages]);

  const sendMessage = useCallback(async () => {
    if (!guest || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const { error: sendError } = await supabase.rpc("send_campfire_guest_message", {
        p_guest_session_id: guest.guest_session_id,
        p_content: draft.trim(),
        p_text_style: {},
      });
      if (sendError) throw sendError;
      setDraft("");
      await loadMessages();
    } catch (sendError) {
      setError(messageOf(sendError));
    } finally {
      setSending(false);
    }
  }, [draft, guest, loadMessages, sending]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!guest || !userId || recording || typeof MediaRecorder === "undefined") return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => setError("Não foi possível gravar a mensagem de áudio.");
      recorder.onstop = () => {
        const durationMs = Math.max(300, Math.min(120000, Date.now() - recordingStartedAtRef.current));
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);

        void (async () => {
          if (!blob.size) return;
          const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
          const path = `${guest.campfire_id}/${userId}/${crypto.randomUUID()}.${extension}`;
          try {
            const upload = await supabase.storage.from("campfire-audio").upload(path, blob, { contentType: mimeType, cacheControl: "3600", upsert: false });
            if (upload.error) throw upload.error;
            const result = await supabase.rpc("send_campfire_guest_audio_message", {
              p_guest_session_id: guest.guest_session_id,
              p_media_path: path,
              p_duration_ms: durationMs,
            });
            if (result.error) {
              await supabase.storage.from("campfire-audio").remove([path]);
              throw result.error;
            }
            await loadMessages();
          } catch (audioError) {
            setError(messageOf(audioError));
          }
        })();
      };

      recorder.start(500);
      setRecording(true);
      window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 120000);
    } catch (audioError) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setError(messageOf(audioError));
    }
  }, [guest, loadMessages, recording, userId]);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const title = guest?.campfire_name ?? invite?.campfire_name ?? "Campfire";
  const activePeople = useMemo(() => Number(invite?.active_people ?? 0), [invite]);

  if (loading) return <main className="guestCampfire guestCampfireCentered">Abrindo convite seguro…</main>;

  if (!guest) {
    return (
      <main className="guestCampfire guestCampfireCentered">
        <section className="guestCampfireCard">
          <div className="guestCampfireFlame">🔥</div>
          <h1>{title}</h1>
          <p>Entre como convidado sem criar uma conta permanente.</p>
          {invite && <small>{activePeople} pessoa(s) ativa(s) agora</small>}
          <label>
            Como devemos chamar você?
            <input
              autoFocus
              maxLength={40}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void enterAsGuest(); }}
              placeholder="Seu nome"
            />
          </label>
          <button type="button" disabled={!displayName.trim() || joining} onClick={() => void enterAsGuest()}>
            {joining ? "Entrando…" : "Entrar na Campfire"}
          </button>
          <p className="guestCampfirePolicy">Convidados não recebem cargos, liderança, sucessão ou privilégios permanentes.</p>
          {error && <div className="guestCampfireError">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="guestCampfire">
      <header className="guestCampfireHeader">
        <div><span>🔥</span><strong>{guest.campfire_name}</strong><small>Convidado: {guest.display_name}</small></div>
        <a href="/" className="guestCampfireDesktopLink">Entrar com conta</a>
      </header>

      <nav className="guestCampfireActions" aria-label="Recursos da Campfire">
        <button type="button" className={voice.joined ? "active" : ""} disabled={voice.joining} onClick={() => void (voice.joined ? voice.leaveVoice() : voice.joinVoice())}>
          {voice.joined ? "Sair da voz" : "Entrar na voz"}
        </button>
        <button type="button" disabled={!voice.joined} onClick={() => void voice.toggleMute()}>{voice.muted ? "Ativar microfone" : "Silenciar"}</button>
        <button type="button" disabled={!voice.joined} onClick={() => void voice.toggleCamera()}>{voice.cameraEnabled ? "Desligar câmera" : "Ligar câmera"}</button>
        <button type="button" className={showScreen ? "active" : ""} onClick={() => setShowScreen((value) => !value)}>Tela</button>
      </nav>

      <section className="guestCampfireBody">
        <div className="guestCampfireChat">
          <div className="guestCampfireMessages" aria-live="polite">
            {messages.length === 0 ? <p className="guestCampfireEmpty">A conversa começa aqui.</p> : messages.map((message) => (
              <article key={message.id} className={message.sender_id === userId ? "mine" : ""}>
                <strong>{message.sender_display_name || "Membro"}</strong>
                {message.message_type === "audio" && message.media_path && audioUrls[message.media_path] ? (
                  <audio controls preload="metadata" src={audioUrls[message.media_path]} />
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            ))}
          </div>
          <div className="guestCampfireComposer">
            <textarea value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
            }} placeholder="Mensagem" />
            <div className="guestCampfireComposerActions">
              <button type="button" className={recording ? "active" : ""} onClick={() => void (recording ? stopRecording() : startRecording())}>
                {recording ? "■ Parar" : "🎙 Áudio"}
              </button>
              <button type="button" disabled={!draft.trim() || sending} onClick={() => void sendMessage()}>Enviar</button>
            </div>
          </div>
        </div>
        {showScreen && <aside className="guestCampfireScreen"><CampfireScreenShare campfireId={guest.campfire_id} /></aside>}
      </section>

      {(error || voice.error) && <div className="guestCampfireToast">{error || voice.error}</div>}
    </main>
  );
}
