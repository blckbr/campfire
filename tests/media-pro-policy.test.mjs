import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

test('Media Pro foundation pins LiveKit client and defaults to SFU', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['livekit-client'], '2.22.0');
  const env = read('.env.example');
  assert.match(env, /VITE_CAMPFIRE_MEDIA_TRANSPORT=livekit/);
  assert.equal(exists('src/media/livekitToken.ts'), true);
});

test('token broker keeps LiveKit secret server-side and validates membership', () => {
  assert.equal(exists('supabase/functions/campfire-media-token/index.ts'), true);
  const source = read('supabase/functions/campfire-media-token/index.ts');
  assert.match(source, /LIVEKIT_API_SECRET/);
  assert.match(source, /get_campfire_members/);
  assert.match(source, /AccessToken/);
  assert.doesNotMatch(read('.env.example'), /LIVEKIT_API_SECRET=/);
});

test('SQL defines atomic owner transfer, moderation flags and voice channels', () => {
  const sql = read('supabase/campfire_media_pro.sql');
  assert.match(sql, /transfer_campfire_ownership/);
  assert.match(sql, /for update/);
  assert.match(sql, /room_voice_muted/);
  assert.match(sql, /room_deafened/);
  assert.match(sql, /room_video_disabled/);
  assert.match(sql, /room_screen_disabled/);
  assert.match(sql, /campfire_voice_channels/);
  assert.match(sql, /campfire_moderation_log/);
});

test('voice defaults to LiveKit adaptiveStream/dynacast and legacy is explicit', () => {
  const selector = read('src/useCampfireVoice.ts');
  const live = read('src/useCampfireLiveKitVoice.ts');
  assert.match(selector, /VITE_CAMPFIRE_MEDIA_TRANSPORT/);
  assert.match(selector, /legacy-p2p/);
  assert.match(live, /adaptiveStream:\s*true/);
  assert.match(live, /dynacast:\s*true/);
  assert.match(live, /requestCampfireMediaToken/);
  assert.doesNotMatch(live, /new RTCPeerConnection/);
});

test('owner transfer remains separate from Watch Together leadership', () => {
  const members = read('src/useCampfireMembers.ts');
  assert.match(members, /transfer_campfire_ownership/);
  assert.match(members, /transfer_campfire_leadership/);
  assert.match(members, /transferOwnership/);
  assert.match(members, /transferLeadership/);
});

test('right-click user menu contains normal and owner-only actions with readable text', () => {
  const menu = read('src/UserContextMenu.tsx');
  const css = read('src/UserContextMenu.css');
  for (const label of [
    'Perfil','Mencionar','Mensagem','Iniciar chamada','Adicionar nota',
    'Adicionar apelido de amigo','Volume do usuário','Silenciar',
    'Silenciar efeitos sonoros','Desativar vídeo','Ver Código de Verificação',
    'Apps','Convidar para Campfire','Ignorar','Bloquear','Copiar ID do usuário',
    'Cargo','Mover para','Abrir na visualização de moderador',
    'Silenciar voz na sala','Desativar áudio na sala','Desconectar','Transferir propriedade'
  ]) assert.match(menu, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /font-size:\s*15px/);
  assert.match(menu, /Escape/);
  assert.match(menu, /Math\.min/);
});

test('typography defines minimum readable functional sizes', () => {
  const css = read('src/CampfireTypography.css');
  assert.match(css, /--cf-font-body:\s*15px/);
  assert.match(css, /--cf-font-control:\s*15px/);
  assert.match(css, /--cf-font-compact:\s*14px/);
  assert.match(css, /--cf-font-secondary:\s*13px/);
});

test('broadcast path has LiveKit implementation without host peer fanout', () => {
  const selector = read('src/useCampfireWebRTC.ts');
  const live = read('src/useCampfireLiveKitBroadcast.ts');
  assert.match(selector, /legacy-p2p/);
  assert.match(live, /requestCampfireMediaToken/);
  assert.match(live, /publishTrack/);
  assert.doesNotMatch(live, /hostPeersRef/);
});

test('LiveKit admin edge function applies moderation to connected participants', () => {
  assert.equal(exists('supabase/functions/campfire-media-admin/index.ts'), true);
  const source = read('supabase/functions/campfire-media-admin/index.ts');
  assert.match(source, /RoomServiceClient/);
  assert.match(source, /updateParticipant/);
  assert.match(source, /moveParticipant/);
  assert.match(source, /removeParticipant/);
  const moderation = read('src/useCampfireModeration.ts');
  assert.match(moderation, /campfire-media-admin/);
});

test('voice dock exposes the same readable right-click user menu', () => {
  const dock = read('src/CampfireVoiceDock.tsx');
  assert.match(dock, /UserContextMenu/);
  assert.match(dock, /onContextMenu/);
  assert.match(dock, /transferOwnership/);
});

test('moderator view is a real component with owner controls', () => {
  assert.equal(exists('src/CampfireModeratorView.tsx'), true);
  assert.equal(exists('src/CampfireModeratorView.css'), true);
  const view = read('src/CampfireModeratorView.tsx');
  const css = read('src/CampfireModeratorView.css');
  assert.match(view, /Silenciar voz na sala/);
  assert.match(view, /Desativar áudio na sala/);
  assert.match(view, /Desativar vídeo na sala/);
  assert.match(view, /Impedir compartilhamento/);
  assert.match(view, /Desconectar da voz/);
  assert.match(view, /Mover para/);
  assert.match(css, /font-size:\s*15px/);
});

test('voice supports persistent Studio Hi-Fi mode using LiveKit high-quality stereo preset', () => {
  const settings = read('src/campfireMediaSettings.ts');
  const voice = read('src/useCampfireLiveKitVoice.ts');
  const dock = read('src/CampfireVoiceDock.tsx');
  assert.match(settings, /audioProfile/);
  assert.match(settings, /studio/);
  assert.match(voice, /AudioPresets\.musicHighQualityStereo/);
  assert.match(voice, /forceStereo:\s*true/);
  assert.match(dock, /Studio \/ Hi-Fi/);
});

test('chat user identities also open the shared right-click user menu', () => {
  const chat = read('src/CampfireChat.tsx');
  assert.match(chat, /UserContextMenu/);
  assert.match(chat, /onContextMenu/);
  assert.match(chat, /senderId/);
  assert.match(chat, /memberSystem\.transferOwnership/);
});

test('social layer persists direct messages, direct calls, identity keys and room invites', () => {
  const sql = read('supabase/campfire_media_pro.sql');
  for (const contract of [
    'direct_threads', 'direct_messages', 'direct_call_sessions',
    'campfire_identity_keys', 'get_or_create_direct_thread',
    'start_direct_call', 'respond_direct_call', 'end_direct_call',
    'invite_user_to_campfire', 'set_campfire_member_role'
  ]) assert.match(sql, new RegExp(contract));
  assert.match(sql, /kick_campfire_member/);
  assert.match(sql, /ban_campfire_member/);
});

test('direct message and direct call UI are mounted in the active Campfire room', () => {
  assert.equal(exists('src/CampfireDirectMessageModal.tsx'), true);
  assert.equal(exists('src/CampfireDirectCallOverlay.tsx'), true);
  const home = read('src/CampfireHome.tsx');
  assert.match(home, /CampfireDirectMessageModal/);
  assert.match(home, /CampfireDirectCallOverlay/);
  assert.match(home, /useCampfireDirectCall/);
});

test('verification code is backed by persistent identity public keys and SHA-256 fingerprinting', () => {
  assert.equal(exists('src/campfireIdentity.ts'), true);
  assert.equal(exists('src/CampfireVerificationModal.tsx'), true);
  const identity = read('src/campfireIdentity.ts');
  assert.match(identity, /ECDSA/);
  assert.match(identity, /P-256/);
  assert.match(identity, /SHA-256/);
  assert.match(identity, /indexedDB/);
  const menu = read('src/UserContextMenu.tsx');
  assert.match(menu, /CampfireVerificationModal|onShowVerification/);
});

test('user menu actions call real friendship invite role move and local media preference APIs', () => {
  const menu = read('src/UserContextMenu.tsx');
  const actions = read('src/useCampfireUserActions.ts');
  assert.match(actions, /toggleFriendship/);
  assert.match(actions, /inviteToCampfire/);
  assert.match(actions, /setEffectsMuted/);
  assert.match(actions, /setVideoHidden/);
  assert.match(menu, /userActions\.toggleFriendship/);
  assert.match(menu, /userActions\.inviteToCampfire/);
  assert.match(menu, /moderation\.setRole/);
  assert.match(menu, /moderation\.moveTo/);
});

test('mention works from any shared user menu and local user media preferences affect chat/video rendering', () => {
  const chat = read('src/CampfireChat.tsx');
  const dock = read('src/CampfireVoiceDock.tsx');
  assert.match(chat, /campfire-mention-user/);
  assert.match(chat, /effectsMuted/);
  assert.match(dock, /videoHidden/);
});

test('moderator view performs kick and ban in addition to media controls', () => {
  const moderation = read('src/useCampfireModeration.ts');
  const view = read('src/CampfireModeratorView.tsx');
  assert.match(moderation, /kick/);
  assert.match(moderation, /ban/);
  assert.match(view, /Expulsar da Campfire/);
  assert.match(view, /Banir da Campfire/);
});

test('direct-call token broker validates call membership rather than only room membership', () => {
  const token = read('supabase/functions/campfire-media-token/index.ts');
  assert.match(token, /direct_call_sessions/);
  assert.match(token, /caller_id/);
  assert.match(token, /callee_id/);
  assert.match(token, /callId/);
});

test('owner cannot leave an occupied Campfire before transferring ownership', () => {
  const sql = read('supabase/campfire_media_pro.sql');
  const campfires = read('src/useCampfires.ts');
  assert.match(sql, /require_owner_transfer_before_leave/);
  assert.match(sql, /OWNER_TRANSFER_REQUIRED/);
  assert.match(campfires, /OWNER_TRANSFER_REQUIRED/);
});

test('every Campfire gets a default Geral voice channel and owner can manage voice channels', () => {
  const sql = read('supabase/campfire_media_pro.sql');
  assert.match(sql, /create_default_campfire_voice_channel/);
  assert.match(sql, /after insert on public\.campfires/);
  assert.match(sql, /create_campfire_voice_channel/);
  assert.match(sql, /rename_campfire_voice_channel/);
  assert.match(sql, /delete_campfire_voice_channel/);
  assert.equal(exists('src/CampfireVoiceChannelManager.tsx'), true);
  const manager = read('src/CampfireVoiceChannelManager.tsx');
  assert.match(manager, /Criar canal de voz/);
  assert.match(manager, /Renomear/);
  assert.match(manager, /Excluir/);
});

test('camera quality settings expose Auto Economy HD and Full HD constraints', () => {
  const settings = read('src/campfireMediaSettings.ts');
  const modal = read('src/CampfireSettingsModal.tsx');
  assert.match(settings, /CampfireVideoQuality/);
  for (const mode of ['auto', 'economy', 'hd', 'full-hd']) assert.match(settings, new RegExp(mode));
  assert.match(settings, /width/);
  assert.match(settings, /height/);
  assert.match(settings, /frameRate/);
  assert.match(modal, /Qualidade da webcam/);
  assert.match(modal, /Full HD/);
});

test('blocking a user also applies local mute effects and camera suppression and blocks friendship creation server-side', () => {
  const actions = read('src/useCampfireUserActions.ts');
  const sql = read('supabase/campfire_media_pro.sql');
  assert.match(actions, /setUserLocalMediaPreference\(targetUserId,\s*\{[^}]*effectsMuted:\s*blocked[^}]*videoHidden:\s*blocked/s);
  assert.match(actions, /setUserVolume/);
  assert.match(sql, /send_campfire_friend_request/);
  assert.match(sql, /direct_users_blocked/);
});

test('user context menu supports keyboard navigation beyond Escape', () => {
  const menu = read('src/UserContextMenu.tsx');
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /ArrowUp/);
  assert.match(menu, /Home/);
  assert.match(menu, /End/);
  assert.match(menu, /querySelectorAll/);
});

test('moderator view exposes participant role join date and moderation log', () => {
  const view = read('src/CampfireModeratorView.tsx');
  const moderation = read('src/useCampfireModeration.ts');
  assert.match(view, /Entrou na Campfire/);
  assert.match(view, /Cargo/);
  assert.match(view, /Histórico de moderação/);
  assert.match(moderation, /campfire_moderation_log/);
  assert.match(moderation, /logs/);
});

test('LiveKit backend keeps token and admin functions plus the Media Pro migration in source control', () => {
  assert.equal(exists('supabase/functions/campfire-media-token/index.ts'), true);
  assert.equal(exists('supabase/functions/campfire-media-admin/index.ts'), true);
  assert.equal(exists('supabase/campfire_media_pro.sql'), true);
  assert.equal(exists('supabase/migrations/20260826142100_campfire_media_pro.sql'), true);
});
