-- Campfire Web 1.0 — secure Web invites, guests, shared timeline and media leases.
-- Guests are deliberately separate from campfire_members and therefore can NEVER receive leadership,
-- ownership, Vice-Mestre/Mestre roles, permanent membership privileges or succession rights.

begin;
create extension if not exists pgcrypto;

create table if not exists public.campfire_web_invites (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz null,
  max_uses integer null check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  allow_guest_watch_start boolean not null default false,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists campfire_web_invites_room_idx
  on public.campfire_web_invites(campfire_id, created_at desc);

create table if not exists public.campfire_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  invite_id uuid not null references public.campfire_web_invites(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  ended_at timestamptz null
);

create unique index if not exists campfire_guest_one_active_session
  on public.campfire_guest_sessions(campfire_id, auth_user_id)
  where ended_at is null;
create index if not exists campfire_guest_sessions_room_idx
  on public.campfire_guest_sessions(campfire_id, last_seen_at desc);

create table if not exists public.campfire_guest_messages (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  guest_session_id uuid not null references public.campfire_guest_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_display_name text not null check (char_length(sender_display_name) between 1 and 40),
  message_type text not null default 'text' check (message_type in ('text','audio','system')),
  content text not null check (char_length(content) between 1 and 2000),
  text_style jsonb not null default '{"fontFamily":"Segoe UI","fontSize":14,"color":"#dfe5eb","bold":false,"italic":false,"underline":false}'::jsonb,
  media_path text null,
  media_duration_ms integer null check (media_duration_ms is null or media_duration_ms between 300 and 120000),
  created_at timestamptz not null default now()
);
create index if not exists campfire_guest_messages_room_time_idx
  on public.campfire_guest_messages(campfire_id, created_at desc);

create table if not exists public.campfire_media_leases (
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  principal_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('voice','screen','watch')),
  connection_id uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (campfire_id, principal_id, purpose)
);

alter table public.campfire_web_invites enable row level security;
alter table public.campfire_guest_sessions enable row level security;
alter table public.campfire_guest_messages enable row level security;
alter table public.campfire_media_leases enable row level security;

-- No direct guest/invite/lease table writes are granted. SECURITY DEFINER RPCs are the API.

create or replace function public.can_participate_in_campfire(
  p_campfire_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.campfire_members m
      where m.campfire_id = p_campfire_id
        and m.user_id = p_user_id
        and m.left_at is null
    )
    or exists (
      select 1
      from public.campfire_guest_sessions g
      where g.campfire_id = p_campfire_id
        and g.auth_user_id = p_user_id
        and g.ended_at is null
        and g.expires_at > now()
    )
  );
$$;

drop policy if exists campfire_guest_messages_participant_read on public.campfire_guest_messages;
create policy campfire_guest_messages_participant_read
on public.campfire_guest_messages
for select to authenticated
using (public.can_participate_in_campfire(campfire_id, auth.uid()));

drop policy if exists campfire_messages_web_participant_read on public.campfire_messages;
create policy campfire_messages_web_participant_read
on public.campfire_messages
for select to authenticated
using (public.can_participate_in_campfire(campfire_id, auth.uid()));

-- The private audio bucket is shared by permanent members and Web guests.
-- Authorization is based on active participation, never on UI state.
drop policy if exists "campfire_audio_authenticated_read" on storage.objects;
drop policy if exists "campfire_audio_insert_own_folder" on storage.objects;
drop policy if exists "campfire_audio_participant_read" on storage.objects;
create policy "campfire_audio_participant_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'campfire-audio'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_participate_in_campfire(((storage.foldername(name))[1])::uuid, auth.uid())
);

drop policy if exists "campfire_audio_participant_insert" on storage.objects;
create policy "campfire_audio_participant_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campfire-audio'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_participate_in_campfire(((storage.foldername(name))[1])::uuid, auth.uid())
);

create or replace function public.create_campfire_web_invite(
  p_campfire_id uuid,
  p_expires_at timestamptz default null,
  p_max_uses integer default null,
  p_allow_guest_watch_start boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_secret text;
  v_hash text;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_campfire_owner(p_campfire_id, v_user) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'INVALID_EXPIRATION'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'INVALID_MAX_USES'; end if;

  v_secret := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_secret, 'sha256'), 'hex');
  insert into public.campfire_web_invites(
    campfire_id, created_by, token_hash, expires_at, max_uses, allow_guest_watch_start
  ) values (
    p_campfire_id, v_user, v_hash, p_expires_at, p_max_uses, coalesce(p_allow_guest_watch_start, false)
  );
  return v_secret;
end;
$$;

create or replace function public.resolve_campfire_web_invite(p_token_hash text)
returns table(
  campfire_id uuid,
  campfire_name text,
  active_people bigint,
  allow_guest_watch_start boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.campfire_id,
    c.name::text,
    (
      select count(*)::bigint
      from public.campfire_members m
      where m.campfire_id = i.campfire_id and m.left_at is null
    ) + (
      select count(*)::bigint
      from public.campfire_guest_sessions g
      where g.campfire_id = i.campfire_id and g.ended_at is null and g.expires_at > now()
    ),
    i.allow_guest_watch_start
  from public.campfire_web_invites i
  join public.campfires c on c.id = i.campfire_id
  where i.token_hash = lower(coalesce(p_token_hash,''))
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.use_count < i.max_uses)
  limit 1;
$$;

create or replace function public.enter_campfire_as_guest(
  p_token_hash text,
  p_display_name text
)
returns table(
  guest_session_id uuid,
  campfire_id uuid,
  campfire_name text,
  display_name text,
  allow_guest_watch_start boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name,''));
  v_invite public.campfire_web_invites%rowtype;
  v_session public.campfire_guest_sessions%rowtype;
  v_room_name text;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'INVALID_GUEST_NAME'; end if;

  select * into v_invite
  from public.campfire_web_invites
  where token_hash = lower(coalesce(p_token_hash,''))
  for update;

  if not found or v_invite.revoked_at is not null then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  select name into v_room_name from public.campfires where id = v_invite.campfire_id;
  if v_room_name is null then raise exception 'CAMPFIRE_NOT_FOUND'; end if;

  update public.campfire_guest_sessions
  set ended_at = now()
  where campfire_id = v_invite.campfire_id
    and auth_user_id = v_user
    and ended_at is null;

  insert into public.campfire_guest_sessions(
    campfire_id, auth_user_id, invite_id, display_name, last_seen_at, expires_at
  ) values (
    v_invite.campfire_id, v_user, v_invite.id, v_name, now(), now() + interval '5 minutes'
  ) returning * into v_session;

  update public.campfire_web_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return query select v_session.id, v_invite.campfire_id, v_room_name, v_name, v_invite.allow_guest_watch_start;
end;
$$;

create or replace function public.heartbeat_campfire_guest(p_guest_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.campfire_guest_sessions g
  set
    last_seen_at = now(),
    expires_at = case
      when exists (
        select 1 from public.campfire_members m
        where m.campfire_id = g.campfire_id and m.left_at is null
      ) then now() + interval '5 minutes'
      else g.expires_at
    end
  where g.id = p_guest_session_id and g.auth_user_id = auth.uid() and g.ended_at is null and g.expires_at > now();
  return found;
end;
$$;

create or replace function public.leave_campfire_guest(p_guest_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.campfire_guest_sessions
  set ended_at = now(), expires_at = now()
  where id = p_guest_session_id and auth_user_id = auth.uid() and ended_at is null;
  return found;
end;
$$;

create or replace function public.send_campfire_guest_message(
  p_guest_session_id uuid,
  p_content text,
  p_text_style jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.campfire_guest_sessions%rowtype;
  v_content text := btrim(coalesce(p_content,''));
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 2000 then raise exception 'INVALID_MESSAGE'; end if;
  select * into v_session
  from public.campfire_guest_sessions
  where id = p_guest_session_id and auth_user_id = v_user
    and ended_at is null and expires_at > now();
  if not found then raise exception 'GUEST_SESSION_EXPIRED'; end if;

  insert into public.campfire_guest_messages(
    campfire_id, guest_session_id, sender_id, sender_display_name, content, text_style
  ) values (
    v_session.campfire_id, v_session.id, v_user, v_session.display_name, v_content,
    coalesce(p_text_style, '{}'::jsonb)
  ) returning id into v_id;

  update public.campfire_guest_sessions
  set last_seen_at = now()
  where id = v_session.id;
  return v_id;
end;
$$;

create or replace function public.send_campfire_guest_audio_message(
  p_guest_session_id uuid,
  p_media_path text,
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.campfire_guest_sessions%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_session from public.campfire_guest_sessions
  where id=p_guest_session_id and auth_user_id=v_user and ended_at is null and expires_at > now();
  if not found then raise exception 'GUEST_SESSION_EXPIRED'; end if;
  if p_media_path is null or p_media_path not like (v_session.campfire_id::text || '/' || v_user::text || '/%')
     or char_length(p_media_path) > 500 then raise exception 'INVALID_AUDIO_PATH'; end if;
  if p_duration_ms is null or p_duration_ms < 300 or p_duration_ms > 120000 then raise exception 'INVALID_AUDIO_DURATION'; end if;

  insert into public.campfire_guest_messages(
    campfire_id, guest_session_id, sender_id, sender_display_name, message_type, content, media_path, media_duration_ms
  ) values (
    v_session.campfire_id, v_session.id, v_user, v_session.display_name, 'audio', '[Mensagem de áudio]', p_media_path, p_duration_ms
  ) returning id into v_id;

  update public.campfire_guest_sessions
  set last_seen_at=now() where id=v_session.id;
  return v_id;
end;
$$;

create or replace function public.get_campfire_web_messages(
  p_campfire_id uuid,
  p_limit integer default 100
)
returns table(
  id uuid,
  campfire_id uuid,
  sender_id uuid,
  message_type text,
  content text,
  text_style jsonb,
  wink_key text,
  media_path text,
  media_duration_ms integer,
  created_at timestamptz,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_participate_in_campfire(p_campfire_id, auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  return query
  select * from (
    select
      m.id::uuid, m.campfire_id::uuid, m.sender_id::uuid, m.message_type::text,
      m.content::text, m.text_style::jsonb, m.wink_key::text, m.media_path::text,
      m.media_duration_ms::integer, m.created_at::timestamptz,
      m.sender_username::text, m.sender_display_name::text, m.sender_avatar_url::text
    from public.get_campfire_messages(p_campfire_id, greatest(1, least(coalesce(p_limit,100), 200))) m
    union all
    select
      g.id, g.campfire_id, g.sender_id, g.message_type, g.content, g.text_style,
      null::text, g.media_path, g.media_duration_ms, g.created_at,
      null::text, g.sender_display_name, null::text
    from public.campfire_guest_messages g
    where g.campfire_id = p_campfire_id
  ) q
  order by q.created_at asc
  limit greatest(1, least(coalesce(p_limit,100), 200));
end;
$$;

create or replace function public.acquire_campfire_media_lease(
  p_campfire_id uuid,
  p_purpose text,
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_current public.campfire_media_leases%rowtype;
begin
  if v_user is null or not public.can_participate_in_campfire(p_campfire_id, v_user) then return false; end if;
  if p_purpose not in ('voice','screen','watch') then return false; end if;
  select * into v_current from public.campfire_media_leases
  where campfire_id = p_campfire_id and principal_id = v_user and purpose = p_purpose
  for update;
  if found and v_current.expires_at > now() and v_current.connection_id <> p_connection_id then return false; end if;
  insert into public.campfire_media_leases(campfire_id, principal_id, purpose, connection_id, expires_at, updated_at)
  values(p_campfire_id, v_user, p_purpose, p_connection_id, now() + interval '3 minutes', now())
  on conflict (campfire_id, principal_id, purpose) do update
  set connection_id=excluded.connection_id, expires_at=excluded.expires_at, updated_at=now();
  return true;
end;
$$;

create or replace function public.refresh_campfire_media_lease(
  p_campfire_id uuid,
  p_purpose text,
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.campfire_media_leases
  set expires_at = now() + interval '3 minutes', updated_at = now()
  where campfire_id=p_campfire_id and principal_id=auth.uid() and purpose=p_purpose and connection_id=p_connection_id;
  return found;
end;
$$;

create or replace function public.release_campfire_media_lease(
  p_campfire_id uuid,
  p_purpose text,
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.campfire_media_leases
  where campfire_id=p_campfire_id and principal_id=auth.uid() and purpose=p_purpose and connection_id=p_connection_id;
  return found;
end;
$$;

-- Extend private Supabase Realtime voice/presence authorization to active guests.
create or replace function public.can_access_campfire_realtime(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text;
  v_id uuid;
begin
  if auth.uid() is null or p_topic is null or p_topic not like 'campfire-voice:%' then return false; end if;
  v_text := split_part(p_topic, ':', 2);
  if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  v_id := v_text::uuid;
  return public.can_participate_in_campfire(v_id, auth.uid());
exception when others then return false;
end;
$$;

revoke all on function public.create_campfire_web_invite(uuid,timestamptz,integer,boolean) from public;
revoke all on function public.resolve_campfire_web_invite(text) from public;
revoke all on function public.enter_campfire_as_guest(text,text) from public;
revoke all on function public.heartbeat_campfire_guest(uuid) from public;
revoke all on function public.leave_campfire_guest(uuid) from public;
revoke all on function public.send_campfire_guest_message(uuid,text,jsonb) from public;
revoke all on function public.send_campfire_guest_audio_message(uuid,text,integer) from public;
revoke all on function public.get_campfire_web_messages(uuid,integer) from public;
revoke all on function public.acquire_campfire_media_lease(uuid,text,uuid) from public;
revoke all on function public.refresh_campfire_media_lease(uuid,text,uuid) from public;
revoke all on function public.release_campfire_media_lease(uuid,text,uuid) from public;

grant execute on function public.create_campfire_web_invite(uuid,timestamptz,integer,boolean) to authenticated;
grant execute on function public.resolve_campfire_web_invite(text) to anon, authenticated;
grant execute on function public.enter_campfire_as_guest(text,text) to authenticated;
grant execute on function public.heartbeat_campfire_guest(uuid) to authenticated;
grant execute on function public.leave_campfire_guest(uuid) to authenticated;
grant execute on function public.send_campfire_guest_message(uuid,text,jsonb) to authenticated;
grant execute on function public.send_campfire_guest_audio_message(uuid,text,integer) to authenticated;
grant execute on function public.get_campfire_web_messages(uuid,integer) to authenticated;
grant execute on function public.can_participate_in_campfire(uuid,uuid) to authenticated;
grant execute on function public.acquire_campfire_media_lease(uuid,text,uuid) to authenticated;
grant execute on function public.refresh_campfire_media_lease(uuid,text,uuid) to authenticated;
grant execute on function public.release_campfire_media_lease(uuid,text,uuid) to authenticated;
grant execute on function public.can_access_campfire_realtime(text) to authenticated;

-- Include guest-message inserts in Supabase Realtime once, if this project uses the default publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='campfire_guest_messages'
     ) then
    alter publication supabase_realtime add table public.campfire_guest_messages;
  end if;
end $$;

commit;
