-- ============================================================================
-- CAMPFIRE — SOCIAL / VOICE UPGRADE (FASE 1)
-- Execute este arquivo UMA VEZ no Supabase Dashboard > SQL Editor.
--
-- Adiciona:
--   • mensagem pessoal estilo WLM
--   • bucket privado para mensagens de áudio
--   • RPC para registrar mensagens de áudio no chat
--   • autorização Realtime para voz/presença em canais privados
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. PERFIL / MENSAGEM PESSOAL
-- --------------------------------------------------------------------------

alter table public.profiles
  add column if not exists status_message text;

alter table public.profiles
  drop constraint if exists profiles_status_message_length;

alter table public.profiles
  add constraint profiles_status_message_length
  check (
    status_message is null or
    char_length(status_message) <= 120
  );

-- --------------------------------------------------------------------------
-- 2. STORAGE PRIVADO PARA ÁUDIO
-- --------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'campfire-audio',
  'campfire-audio',
  false,
  12582912, -- 12 MiB; o app limita a gravação a 2 minutos.
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O caminho usado pelo app é:
--   <campfire_id>/<user_id>/<uuid>.webm

-- Ler: autenticados podem gerar URL assinada para objetos deste bucket.
-- A visibilidade da mensagem continua sendo controlada por get_campfire_messages.
drop policy if exists "campfire_audio_authenticated_read"
  on storage.objects;

create policy "campfire_audio_authenticated_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campfire-audio'
  and (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.get_campfire_members(
      ((storage.foldername(name))[1])::uuid
    ) as m
    where m.id::text = auth.uid()::text
  )
);

-- Inserir: somente dentro da própria pasta de usuário.
drop policy if exists "campfire_audio_insert_own_folder"
  on storage.objects;

create policy "campfire_audio_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campfire-audio'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.get_campfire_members(
      ((storage.foldername(name))[1])::uuid
    ) as m
    where m.id::text = auth.uid()::text
  )
);

-- Apagar: o próprio remetente pode remover o arquivo se o envio da RPC falhar.
drop policy if exists "campfire_audio_delete_own_folder"
  on storage.objects;

create policy "campfire_audio_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campfire-audio'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- --------------------------------------------------------------------------
-- 3. RPC: ENVIAR MENSAGEM DE ÁUDIO
-- --------------------------------------------------------------------------

create or replace function public.send_campfire_audio_message(
  p_campfire_id uuid,
  p_media_path text,
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_campfire_id is null then
    raise exception 'CAMPFIRE_NOT_FOUND';
  end if;

  if p_media_path is null
     or char_length(p_media_path) < 10
     or char_length(p_media_path) > 500
  then
    raise exception 'INVALID_AUDIO_PATH';
  end if;

  if p_duration_ms is null
     or p_duration_ms < 300
     or p_duration_ms > 120000
  then
    raise exception 'INVALID_AUDIO_DURATION';
  end if;

  -- O arquivo só pode apontar para a Campfire e usuário que estão enviando.
  if p_media_path not like (
    p_campfire_id::text || '/' || v_user_id::text || '/%'
  ) then
    raise exception 'INVALID_AUDIO_PATH';
  end if;

  -- Reutiliza a mesma visão de membros já usada pelo cliente.
  if not exists (
    select 1
    from public.get_campfire_members(p_campfire_id) as m
    where m.id::text = v_user_id::text
  ) then
    raise exception 'NOT_MEMBER';
  end if;

  insert into public.campfire_messages (
    campfire_id,
    sender_id,
    message_type,
    content,
    text_style,
    wink_key,
    media_path,
    media_duration_ms
  )
  values (
    p_campfire_id,
    v_user_id,
    'audio',
    '[Mensagem de áudio]',
    '{"fontFamily":"Segoe UI","fontSize":12,"color":"#405761","bold":false,"italic":false,"underline":false}'::jsonb,
    null,
    p_media_path,
    p_duration_ms
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.send_campfire_audio_message(uuid, text, integer)
  from public;

grant execute on function public.send_campfire_audio_message(uuid, text, integer)
  to authenticated;

-- --------------------------------------------------------------------------
-- 4. REALTIME PRIVADO — VOZ + PRESENÇA
-- --------------------------------------------------------------------------
-- O frontend usa canais "campfire-voice:<uuid>" com private:true.
-- Estas políticas liberam Broadcast e Presence somente para membros da Campfire.
-- A próxima fase (cargos/permissões) poderá restringir também por cargo/ação.

-- Helper de autorização. O UUID da Campfire vem depois de
-- "campfire-voice:" e é validado antes de consultar os membros.
create or replace function public.can_access_campfire_realtime(
  p_topic text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_campfire_text text;
  v_campfire_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  if p_topic is null or p_topic not like 'campfire-voice:%' then
    return false;
  end if;

  v_campfire_text := split_part(p_topic, ':', 2);

  if v_campfire_text !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_campfire_id := v_campfire_text::uuid;

  return exists (
    select 1
    from public.get_campfire_members(v_campfire_id) as m
    where m.id::text = v_user_id::text
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function public.can_access_campfire_realtime(text)
  from public;

grant execute on function public.can_access_campfire_realtime(text)
  to authenticated;

-- SELECT = receber Broadcast/Presence, apenas se for membro da Campfire.
drop policy if exists "campfire_voice_realtime_receive"
  on realtime.messages;

create policy "campfire_voice_realtime_receive"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_access_campfire_realtime(
    (select realtime.topic())
  )
);

-- INSERT = enviar Broadcast/Presence, apenas se for membro da Campfire.
drop policy if exists "campfire_voice_realtime_send"
  on realtime.messages;

create policy "campfire_voice_realtime_send"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_access_campfire_realtime(
    (select realtime.topic())
  )
);

commit;

notify pgrst, 'reload schema';
