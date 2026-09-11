import { useState } from "react";
import type { FriendItem } from "./useFriendships";
import type { CampfireMember } from "./useCampfireMembers";
import "./CampfireRightRail.css";

type Props = {
  friends: FriendItem[];
  members: CampfireMember[];
  currentUserId: string;
  onAddFriend: () => void;
  onParticipantContextMenu: (userId: string, x: number, y: number) => void;
  showParticipants?: boolean;
  moodCoverUrl?: string | null;
  moodRoomName?: string | null;
};

function displayName(profile: { username: string | null; display_name: string | null }) {
  return profile.display_name || (profile.username ? `@${profile.username}` : "Usuário");
}

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function Avatar({ avatar_url, name }: { avatar_url: string | null; name: string }) {
  return (
    <span
      className="campfireRailAvatar"
      style={avatar_url ? { backgroundImage: `url("${avatar_url}")` } : undefined}
      aria-hidden="true"
    >
      {avatar_url ? "" : initials(name)}
    </span>
  );
}

export default function CampfireRightRail({
  friends,
  members,
  currentUserId,
  onAddFriend,
  onParticipantContextMenu,
  showParticipants = true,
  moodCoverUrl = null,
  moodRoomName = null,
}: Props) {
  const [query, setQuery] = useState("");
  const sortedFriends = [...friends].sort((a, b) => {
    const aOffline = a.profile.status === "offline" ? 1 : 0;
    const bOffline = b.profile.status === "offline" ? 1 : 0;
    if (aOffline !== bOffline) return aOffline - bOffline;
    return displayName(a.profile).localeCompare(displayName(b.profile), "pt-BR");
  });

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleFriends = normalizedQuery
    ? sortedFriends.filter((friend) => displayName(friend.profile).toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : sortedFriends;

  return (
    <aside className="campfireRightRail" aria-label="Amigos e participantes">
      <div className="campfireRightRailScroll">
      <div className="campfireRightRailSearch">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          placeholder="Buscar amigos..."
          aria-label="Buscar amigos"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={onAddFriend} title="Adicionar amigo" aria-label="Adicionar amigo">＋</button>
      </div>

      <section className="campfireRightRailSection">
        <div className="campfireRightRailHeading">
          <div>
            <span className="campfireRightRailEyebrow">REDE</span>
            <h3>Amigos</h3>
          </div>
          <span className="campfireRightRailSeeAll">Ver todos</span>
        </div>

        <div className="campfireRightRailList">
          {visibleFriends.length === 0 && (
            <p className="campfireRightRailEmpty">{normalizedQuery ? "Nenhum amigo encontrado." : "Seus amigos aparecerão aqui."}</p>
          )}
          {visibleFriends.map((friend) => {
            const person = friend.profile;
            const name = displayName(person);
            return (
              <div className="campfireRailPerson" key={friend.friendshipId}>
                <div className="campfireRailAvatarWrap">
                  <Avatar avatar_url={person.avatar_url} name={name} />
                  <span className={`campfireRailPresence ${person.status || "offline"}`} />
                </div>
                <div className="campfireRailPersonCopy">
                  <strong>{name}</strong>
                  <small>{person.status === "offline" ? "Offline" : person.status === "away" ? "Ausente" : person.status === "busy" ? "Ocupado" : "Online"}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {showParticipants && (
      <section className="campfireRightRailSection campfireRightRailParticipants">
        <div className="campfireRightRailHeading">
          <div>
            <span className="campfireRightRailEyebrow">NA CAMPFIRE</span>
            <h3>Participantes <small>{members.length}</small></h3>
          </div>
        </div>

        <div className="campfireRightRailList">
          {members.length === 0 && (
            <p className="campfireRightRailEmpty">Nenhum participante conectado.</p>
          )}
          {members.map((member) => {
            const name = displayName(member);
            const isCurrent = member.id === currentUserId;
            return (
              <div
                className="campfireRailPerson"
                key={member.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onParticipantContextMenu(member.id, event.clientX, event.clientY);
                }}
              >
                <div className="campfireRailAvatarWrap">
                  <Avatar avatar_url={member.avatar_url} name={name} />
                  <span className={`campfireRailPresence ${member.status || "online"}`} />
                </div>
                <div className="campfireRailPersonCopy">
                  <strong>
                    {name}
                    {member.is_leader ? <span className="campfireRailCrown" title="Mestre da Fogueira">♛</span> : null}
                  </strong>
                  <small>{isCurrent ? "Você" : member.role || "Participante"}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}
      </div>

      {moodCoverUrl ? (
        <div
          className="campfireRightRailMood"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(5,7,10,.08), rgba(5,7,10,.78)), url("${moodCoverUrl}")`,
          }}
        >
          <blockquote>“Boas conversas viram histórias que a gente leva junto.”</blockquote>
          <span>{moodRoomName || "Campfire"}</span>
        </div>
      ) : null}

    </aside>
  );
}
