import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type {
  CampfireMember,
  useCampfireMembers,
} from "./useCampfireMembers";

import type {
  CampfireVoiceController,
} from "./useCampfireVoice";

import UserContextMenu from "./UserContextMenu";
import CampfireModeratorView from "./CampfireModeratorView";
import { useCampfireModeration } from "./useCampfireModeration";
import {
  CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT,
  getUserLocalMediaPreference,
} from "./userLocalMediaPreferences";

import "./CampfireVoiceDock.css";

type Props = {
  campfireId: string;
  variant?: "dock" | "header";
  voice: CampfireVoiceController;
  members: CampfireMember[];
  currentUserId: string;
  memberSystem: ReturnType<typeof useCampfireMembers>;
};

function memberName(
  members: CampfireMember[],
  userId: string
): string {
  const member = members.find(
    (item) => item.id === userId
  );

  return member?.username
    ? `@${member.username}`
    : "Usuário";
}

function voicePhaseLabel(phase: CampfireVoiceController["phase"]): string {
  switch (phase) {
    case "disconnected": return "Desconectado";
    case "connecting": return "Conectando…";
    case "connected-listener": return "Na voz • ouvindo";
    case "publishing-microphone": return "Conectado • ativando microfone…";
    case "connected-speaking": return "Na voz";
    case "reconnecting": return "Reconectando…";
    case "microphone-unavailable": return "Na voz • Microfone indisponível";
    case "error": return "Erro de voz";
  }
}

function voiceErrorLabel(code: CampfireVoiceController["errorCode"]): string {
  switch (code) {
    case "token": return "Falha de autenticação de voz";
    case "network": return "Falha de rede de voz";
    case "microphone-permission": return "Permissão de microfone negada";
    case "microphone-device": return "Microfone indisponível";
    case "playback-subscription": return "Falha ao reproduzir áudio remoto";
    case "unknown": return "Erro de voz";
    case null: return "";
  }
}

function RemoteVideo({
  stream,
  label,
  onContextMenu,
}: {
  stream: MediaStream;
  label: string;
  onContextMenu?: (event: ReactMouseEvent) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(
    null
  );

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.srcObject = stream;
    void video.play().catch(() => undefined);

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="campfireVoiceVideoCard" onContextMenu={onContextMenu}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
      />

      <span>{label}</span>
    </div>
  );
}

function CampfireVoiceDock({
  campfireId,
  variant = "dock",
  voice,
  members,
  currentUserId,
  memberSystem,
}: Props) {
  const [actionMessage, setActionMessage] =
    useState("");
  const [contextTargetId, setContextTargetId] = useState<string | null>(null);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  const [moderatorTargetId, setModeratorTargetId] = useState<string | null>(null);
  const [localMediaRevision, setLocalMediaRevision] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const moderation = useCampfireModeration(campfireId, memberSystem.isCurrentUserOwner);
  const contextTarget = contextTargetId
    ? members.find((member) => member.id === contextTargetId) ?? null
    : null;
  const moderatorTarget = moderatorTargetId
    ? members.find((member) => member.id === moderatorTargetId) ?? null
    : null;

  function openContext(event: ReactMouseEvent, userId: string) {
    event.preventDefault();
    setContextTargetId(userId);
    setContextPosition({ x: event.clientX, y: event.clientY });
  }

  useEffect(() => {
    const handler = () => setLocalMediaRevision((value) => value + 1);
    window.addEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(CAMPFIRE_USER_MEDIA_PREFERENCES_EVENT, handler);
  }, []);

  async function camera() {
    const result = await voice.toggleCamera();
    setActionMessage(result.message);
  }

  async function mute() {
    const result = await voice.toggleMute();
    setActionMessage(result.message);
  }

  async function deafen() {
    const result = await voice.toggleDeafen();
    setActionMessage(result.message);
  }

  const voiceProfileStatus =
    voice.voiceProfile === "strong"
      ? voice.rnnoiseActive
        ? "Supressão forte • RNNoise ativo"
        : "Voz limpa • RNNoise indisponível"
      : voice.voiceProfile === "studio"
        ? "Studio / Hi-Fi"
        : "Voz limpa • Supressão nativa";

  const connectionStatus = voicePhaseLabel(voice.phase);
  const diagnosticStatus = voiceErrorLabel(voice.errorCode);

  const remoteVideoEntries = Object.entries(
    voice.remoteStreams as Record<string, MediaStream>
  ).filter(([userId, stream]) => {
    const live = voice.presence[userId];

    const { videoHidden } = getUserLocalMediaPreference(userId);
    void localMediaRevision;
    return (
      live?.cameraEnabled === true &&
      stream.getVideoTracks().length > 0 &&
      !videoHidden
    );
  });

  return (
    <section
      className={[
        "campfireVoiceDock",
        voice.joined ? "joined" : "",
        variant === "header" ? "headerCompact" : "",
      ].filter(Boolean).join(" ")}
      title={`${connectionStatus}${diagnosticStatus ? ` • ${diagnosticStatus}` : ""}`}
    >
      <div className="campfireVoiceMainRow">
        <div className="campfireVoiceIdentity">
          <span className="campfireVoiceIcon" aria-hidden="true">
            🎧
          </span>

          <div>
            <strong>VOZ — Campfire</strong>
            <small>
              {voice.voiceMembers.length} pessoa(s) na voz • {connectionStatus}
            </small>
            {diagnosticStatus ? (
              <small className="campfireVoiceDiagnostic">{diagnosticStatus}</small>
            ) : null}
          </div>
        </div>

        <div className="campfireVoiceActions" aria-label="Controles de voz">
          <button
            type="button"
            className={voice.muted ? "active isMuted" : ""}
            aria-pressed={voice.muted}
            aria-label={voice.muted ? "Microfone mutado" : "Microfone ativo"}
            disabled={!voice.joined || voice.phase === "microphone-unavailable"}
            onClick={() => void mute()}
            title={voice.muted ? "Microfone mutado" : "Mutar microfone"}
          >
            <span aria-hidden="true">{voice.muted ? "🔇" : "🎙"}</span>
            <span>{voice.muted ? "Mutado" : "Microfone"}</span>
          </button>

          <button
            type="button"
            className={voice.cameraEnabled ? "active isCameraOn" : ""}
            aria-pressed={voice.cameraEnabled}
            aria-label={voice.cameraEnabled ? "Câmera ligada" : "Câmera desligada"}
            disabled={!voice.joined || !voice.hasCamera}
            onClick={() => void camera()}
            title={
              voice.cameraEnabled
                ? "Câmera ligada"
                : voice.hasCamera
                  ? "Ligar câmera"
                  : "Nenhuma webcam detectada"
            }
          >
            <span aria-hidden="true">📹</span>
            <span>{voice.cameraEnabled ? "Câmera ligada" : "Câmera"}</span>
          </button>

          <button
            type="button"
            className={voice.deafened ? "active isDeafened" : ""}
            aria-pressed={voice.deafened}
            aria-label={voice.deafened ? "Áudio desativado" : "Áudio ativo"}
            disabled={!voice.joined}
            onClick={() => void deafen()}
            title={voice.deafened ? "Áudio desativado" : "Desativar áudio para mim"}
          >
            <span aria-hidden="true">{voice.deafened ? "🔕" : "🔊"}</span>
            <span>{voice.deafened ? "Áudio desativado" : "Deafen"}</span>
          </button>

          <button
            type="button"
            className={showAdvanced ? "active" : ""}
            aria-pressed={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
            title="Configurações avançadas da voz"
          >
            <span aria-hidden="true">⚙</span>
            <span>Configurações</span>
          </button>
        </div>
      </div>

      {showAdvanced && voice.joined && (
        <div className="campfireVoiceMixer">
          <div className="campfireVoiceAudioProfile">
            <div>
              <strong>Campfire Voice Pro</strong>
              <small>{voiceProfileStatus}</small>
            </div>
            <select
              aria-label="Perfil Voice Pro"
              value={voice.voiceProfile}
              onChange={(event) => {
                const result = voice.setVoiceProfile(
                  event.target.value as "clean" | "strong" | "studio"
                );
                setActionMessage(result.message);
              }}
            >
              <option value="clean">Voz limpa</option>
              <option value="strong">Supressão forte</option>
              <option value="studio">Studio / Hi-Fi</option>
            </select>
          </div>

          <div className="campfireVoiceMeterGroup">
            <span>Seu microfone</span>
            <div
              className="campfireVoiceMeter"
              role="meter"
              aria-label="Nível do seu microfone"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={voice.inputLevel}
            >
              <i style={{ width: `${voice.inputLevel}%` }} />
            </div>
            <small>
              {voice.inputLevel}% entrada • {voice.processedLevel}% processado
            </small>
          </div>
          <label>
            <span>
              Meu microfone para os outros
              <b>{voice.outgoingVolume}%</b>
            </span>

            <input
              type="range"
              min="0"
              max="200"
              step="5"
              value={voice.outgoingVolume}
              onChange={(event) =>
                voice.setOutgoingVolume(
                  Number(event.target.value)
                )
              }
            />
          </label>

          <label className="campfireVoiceMonitorToggle">
            <input
              type="checkbox"
              checked={voice.monitorEnabled}
              onChange={(event) =>
                voice.setMonitorEnabled(
                  event.target.checked
                )
              }
            />

            Ouvir meu próprio microfone
          </label>

          {voice.monitorEnabled && (
            <label>
              <span>
                Meu retorno
                <b>{voice.monitorVolume}%</b>
              </span>

              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={voice.monitorVolume}
                onChange={(event) =>
                  voice.setMonitorVolume(
                    Number(event.target.value)
                  )
                }
              />
            </label>
          )}
        </div>
      )}

      {showAdvanced && voice.joined && voice.voiceMembers.length > 0 && (
        <div className="campfireVoicePeople">
          {voice.voiceMembers.map((member) => {
            const isSelf = member.userId === currentUserId;
            const isSpeaking = voice.speakingParticipantIds.has(member.userId);
            const locallyMuted = voice.isParticipantLocallyMuted(member.userId);
            const participantVolume = voice.getUserVolume(member.userId);

            return (
              <div
                key={member.userId}
                onContextMenu={(event) => openContext(event, member.userId)}
                className={[
                  "campfireVoicePerson",
                  isSelf ? "self" : "",
                  isSpeaking ? "isSpeaking" : "",
                ].filter(Boolean).join(" ")}
              >
                <div className="campfireVoicePersonHeader">
                  <span className="campfireVoicePersonState" aria-hidden="true">
                    {member.micEnabled ? "🎙" : "🔇"}
                    {member.cameraEnabled ? " 📹" : ""}
                  </span>
                  <strong>{memberName(members, member.userId)}</strong>
                  {isSpeaking ? <em>Falando</em> : null}
                </div>

                {!isSelf ? (
                  <div className="campfireVoiceParticipantMixer">
                    <label>
                      <span>Volume <b>{participantVolume}%</b></span>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="5"
                        value={participantVolume}
                        onChange={(event) =>
                          voice.setParticipantVolume(
                            member.userId,
                            Number(event.target.value)
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className={locallyMuted ? "active" : ""}
                      aria-pressed={locallyMuted}
                      onClick={() =>
                        voice.setParticipantLocallyMuted(
                          member.userId,
                          !locallyMuted
                        )
                      }
                    >
                      {locallyMuted ? "Reativar local" : "Silenciar local"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showAdvanced && (
        (voice.cameraEnabled &&
        voice.localCameraStream
      ) || remoteVideoEntries.length > 0 ? (
        <div className="campfireVoiceVideoGrid">
          {voice.cameraEnabled &&
            voice.localCameraStream && (
              <RemoteVideo
                stream={voice.localCameraStream}
                label="Você"
              />
            )}

          {remoteVideoEntries.map(
            ([userId, stream]) => (
              <RemoteVideo
                key={userId}
                stream={stream}
                label={memberName(members, userId)}
                onContextMenu={(event) => openContext(event, userId)}
              />
            )
          )}
        </div>
      ) : null)}

      {(actionMessage || voice.errorMessage) && (
        <div className="campfireVoiceMessage">
          {voice.errorMessage || actionMessage}
        </div>
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
        onModeratorView={(userId) => { setModeratorTargetId(userId); setContextTargetId(null); }}
        onTransferOwnership={(userId) => memberSystem.transferOwnership(userId)}
      />

      <CampfireModeratorView
        open={moderatorTarget !== null && memberSystem.isCurrentUserOwner}
        target={moderatorTarget}
        moderation={moderation}
        onClose={() => setModeratorTargetId(null)}
      />
    </section>
  );
}

export default CampfireVoiceDock;
