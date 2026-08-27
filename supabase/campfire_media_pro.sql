-- Campfire Media Pro — owner/moderation/voice channels/social state
-- Execute after the existing Campfire schema and campfire_social_voice_upgrade.sql.
begin;

create extension if not exists pgcrypto;

-- Original Campfire membership schema uses left_at (NULL = active).
-- Media Pro adds only the role metadata; it must not invent a physical state column.
alter table public.campfire_members
  add column if not exists role text not null default 'member';

create table if not exists public.campfire_voice_channels (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists campfire_voice_channels_one_default
  on public.campfire_voice_channels(campfire_id) where is_default;

create table if not exists public.campfire_member_media_state (
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_voice_muted boolean not null default false,
  room_deafened boolean not null default false,
  room_video_disabled boolean not null default false,
  room_screen_disabled boolean not null default false,
  voice_channel_id uuid null references public.campfire_voice_channels(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campfire_id, user_id)
);

create table if not exists public.campfire_moderation_log (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_private_relationship_settings (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  note text null check (note is null or char_length(note) <= 1000),
  alias text null check (alias is null or char_length(alias) <= 80),
  ignored boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, target_user_id),
  check (owner_user_id <> target_user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.campfire_bans (
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid not null references auth.users(id) on delete cascade,
  reason text null check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (campfire_id, user_id)
);

-- Seed one default voice channel per Campfire.
insert into public.campfire_voice_channels(campfire_id, name, position, is_default)
select c.id, 'Geral', 0, true
from public.campfires c
where not exists (
  select 1 from public.campfire_voice_channels vc
  where vc.campfire_id = c.id and vc.is_default
);

-- Every new Campfire gets its own default voice channel automatically.
create or replace function public.create_default_campfire_voice_channel()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.campfire_voice_channels(campfire_id, name, position, is_default)
  values (new.id, 'Geral', 0, true)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists campfire_create_default_voice_channel on public.campfires;
create trigger campfire_create_default_voice_channel
after insert on public.campfires
for each row execute function public.create_default_campfire_voice_channel();

create or replace function public.is_campfire_owner(p_campfire_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.campfires c
    where c.id = p_campfire_id and c.owner_id = p_user_id
  );
$$;

create or replace function public.is_active_campfire_member(p_campfire_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.get_campfire_members(p_campfire_id) m
    where m.id::text = p_user_id::text
  );
$$;

-- Owner-only voice-channel administration. Roles never inherit these powers.
create or replace function public.create_campfire_voice_channel(
  p_campfire_id uuid,
  p_name text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_position integer;
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'INVALID_VOICE_CHANNEL_NAME'; end if;
  select coalesce(max(position), 0) + 1 into v_position
  from public.campfire_voice_channels where campfire_id = p_campfire_id;
  insert into public.campfire_voice_channels(campfire_id, name, position, is_default)
  values(p_campfire_id, v_name, v_position, false) returning id into v_id;
  insert into public.campfire_moderation_log(campfire_id, actor_user_id, action, metadata)
  values(p_campfire_id, v_actor, 'create_voice_channel', jsonb_build_object('voice_channel_id', v_id, 'name', v_name));
  return v_id;
end;
$$;

create or replace function public.rename_campfire_voice_channel(
  p_campfire_id uuid,
  p_voice_channel_id uuid,
  p_name text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'INVALID_VOICE_CHANNEL_NAME'; end if;
  update public.campfire_voice_channels set name = v_name
  where id = p_voice_channel_id and campfire_id = p_campfire_id;
  if not found then raise exception 'VOICE_CHANNEL_NOT_FOUND'; end if;
  insert into public.campfire_moderation_log(campfire_id, actor_user_id, action, metadata)
  values(p_campfire_id, v_actor, 'rename_voice_channel', jsonb_build_object('voice_channel_id', p_voice_channel_id, 'name', v_name));
end;
$$;

create or replace function public.delete_campfire_voice_channel(
  p_campfire_id uuid,
  p_voice_channel_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_default_id uuid;
  v_is_default boolean;
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  select is_default into v_is_default from public.campfire_voice_channels
  where id = p_voice_channel_id and campfire_id = p_campfire_id;
  if not found then raise exception 'VOICE_CHANNEL_NOT_FOUND'; end if;
  if v_is_default then raise exception 'CANNOT_DELETE_DEFAULT_VOICE_CHANNEL'; end if;
  select id into v_default_id from public.campfire_voice_channels
  where campfire_id = p_campfire_id and is_default limit 1;
  if v_default_id is null then raise exception 'DEFAULT_VOICE_CHANNEL_NOT_FOUND'; end if;
  update public.campfire_member_media_state set voice_channel_id = v_default_id, updated_at = now()
  where campfire_id = p_campfire_id and voice_channel_id = p_voice_channel_id;
  delete from public.campfire_voice_channels where id = p_voice_channel_id and campfire_id = p_campfire_id;
  insert into public.campfire_moderation_log(campfire_id, actor_user_id, action, metadata)
  values(p_campfire_id, v_actor, 'delete_voice_channel', jsonb_build_object('voice_channel_id', p_voice_channel_id, 'moved_to', v_default_id));
end;
$$;

create or replace function public.transfer_campfire_ownership(
  p_campfire_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_current_owner uuid;
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_new_owner_id is null or p_new_owner_id = v_actor then raise exception 'INVALID_NEW_OWNER'; end if;

  select owner_id into v_current_owner
  from public.campfires
  where id = p_campfire_id
  for update;

  if v_current_owner is null then raise exception 'CAMPFIRE_NOT_FOUND'; end if;
  if v_current_owner <> v_actor then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if not public.is_active_campfire_member(p_campfire_id, p_new_owner_id) then
    raise exception 'NEW_OWNER_NOT_ACTIVE_MEMBER';
  end if;

  update public.campfires
  set owner_id = p_new_owner_id
  where id = p_campfire_id;

  insert into public.campfire_moderation_log(campfire_id, actor_user_id, target_user_id, action, metadata)
  values (p_campfire_id, v_actor, p_new_owner_id, 'transfer_ownership', jsonb_build_object('previous_owner_id', v_actor));
end;
$$;

create or replace function public.set_campfire_member_moderation(
  p_campfire_id uuid,
  p_target_user_id uuid,
  p_room_voice_muted boolean default null,
  p_room_deafened boolean default null,
  p_room_video_disabled boolean default null,
  p_room_screen_disabled boolean default null
)
returns public.campfire_member_media_state
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_state public.campfire_member_media_state;
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if not public.is_active_campfire_member(p_campfire_id, p_target_user_id) then raise exception 'TARGET_NOT_ACTIVE_MEMBER'; end if;

  insert into public.campfire_member_media_state(campfire_id, user_id)
  values (p_campfire_id, p_target_user_id)
  on conflict (campfire_id, user_id) do nothing;

  update public.campfire_member_media_state
  set room_voice_muted = coalesce(p_room_voice_muted, room_voice_muted),
      room_deafened = coalesce(p_room_deafened, room_deafened),
      room_video_disabled = coalesce(p_room_video_disabled, room_video_disabled),
      room_screen_disabled = coalesce(p_room_screen_disabled, room_screen_disabled),
      updated_at = now()
  where campfire_id = p_campfire_id and user_id = p_target_user_id
  returning * into v_state;

  insert into public.campfire_moderation_log(campfire_id, actor_user_id, target_user_id, action, metadata)
  values (p_campfire_id, v_actor, p_target_user_id, 'set_media_moderation', to_jsonb(v_state));
  return v_state;
end;
$$;

create or replace function public.move_campfire_voice_member(
  p_campfire_id uuid,
  p_target_user_id uuid,
  p_voice_channel_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if not exists(select 1 from public.campfire_voice_channels where id = p_voice_channel_id and campfire_id = p_campfire_id) then
    raise exception 'VOICE_CHANNEL_NOT_FOUND';
  end if;
  if not public.is_active_campfire_member(p_campfire_id, p_target_user_id) then raise exception 'TARGET_NOT_ACTIVE_MEMBER'; end if;
  insert into public.campfire_member_media_state(campfire_id,user_id,voice_channel_id)
  values(p_campfire_id,p_target_user_id,p_voice_channel_id)
  on conflict(campfire_id,user_id) do update set voice_channel_id=excluded.voice_channel_id, updated_at=now();
  insert into public.campfire_moderation_log(campfire_id,actor_user_id,target_user_id,action,metadata)
  values(p_campfire_id,v_actor,p_target_user_id,'move_voice_channel',jsonb_build_object('voice_channel_id',p_voice_channel_id));
end;
$$;

create or replace function public.disconnect_campfire_voice_member(p_campfire_id uuid, p_target_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  insert into public.campfire_moderation_log(campfire_id,actor_user_id,target_user_id,action)
  values(p_campfire_id,v_actor,p_target_user_id,'disconnect_voice');
  perform pg_notify('campfire_voice_disconnect', json_build_object('campfireId',p_campfire_id,'userId',p_target_user_id)::text);
end;
$$;

create or replace function public.upsert_user_private_relationship_setting(
  p_target_user_id uuid,
  p_note text default null,
  p_alias text default null,
  p_ignored boolean default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id = v_user then raise exception 'INVALID_TARGET'; end if;
  insert into public.user_private_relationship_settings(owner_user_id,target_user_id,note,alias,ignored)
  values(v_user,p_target_user_id,p_note,p_alias,coalesce(p_ignored,false))
  on conflict(owner_user_id,target_user_id) do update
  set note=coalesce(p_note,user_private_relationship_settings.note),
      alias=coalesce(p_alias,user_private_relationship_settings.alias),
      ignored=coalesce(p_ignored,user_private_relationship_settings.ignored),
      updated_at=now();
end;
$$;

create or replace function public.set_user_block(p_target_user_id uuid, p_blocked boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id = v_user then raise exception 'INVALID_TARGET'; end if;
  if p_blocked then
    insert into public.user_blocks(blocker_id,blocked_id) values(v_user,p_target_user_id)
    on conflict do nothing;
  else
    delete from public.user_blocks where blocker_id=v_user and blocked_id=p_target_user_id;
  end if;
end;
$$;



-- ============================================================
-- Social / Direct Messages / Direct Calls / Identity
-- ============================================================

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique (user_a, user_b)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_thread_created_idx
  on public.direct_messages(thread_id, created_at);

create table if not exists public.direct_call_sessions (
  id uuid primary key default gen_random_uuid(),
  campfire_id uuid not null references public.campfires(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing','active','declined','ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz null,
  ended_at timestamptz null,
  check (caller_id <> callee_id)
);
create index if not exists direct_call_sessions_participants_idx
  on public.direct_call_sessions(caller_id, callee_id, status, created_at desc);

create table if not exists public.campfire_identity_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_key text not null check (char_length(public_key) between 30 and 4000),
  fingerprint text not null check (char_length(fingerprint) between 16 and 300),
  updated_at timestamptz not null default now()
);

create or replace function public.direct_users_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.user_blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

create or replace function public.send_campfire_friend_request(p_target_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id is null or p_target_user_id = v_user then raise exception 'INVALID_TARGET'; end if;
  if public.direct_users_blocked(v_user, p_target_user_id) then raise exception 'USER_BLOCKED'; end if;
  select id into v_existing from public.friendships
  where (requester_id=v_user and addressee_id=p_target_user_id)
     or (requester_id=p_target_user_id and addressee_id=v_user)
  limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.friendships(requester_id, addressee_id, status)
  values(v_user, p_target_user_id, 'pending') returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_or_create_direct_thread(p_target_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_thread uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id is null or p_target_user_id = v_user then raise exception 'INVALID_TARGET'; end if;
  if public.direct_users_blocked(v_user, p_target_user_id) then raise exception 'USER_BLOCKED'; end if;

  v_a := least(v_user, p_target_user_id);
  v_b := greatest(v_user, p_target_user_id);
  insert into public.direct_threads(user_a, user_b)
  values(v_a, v_b)
  on conflict(user_a, user_b) do update set user_a = excluded.user_a
  returning id into v_thread;
  return v_thread;
end;
$$;

create or replace function public.send_direct_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_thread public.direct_threads;
  v_other uuid;
  v_id uuid;
  v_body text := btrim(coalesce(p_body,''));
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception 'INVALID_MESSAGE'; end if;
  select * into v_thread from public.direct_threads where id = p_thread_id;
  if v_thread.id is null or (v_thread.user_a <> v_user and v_thread.user_b <> v_user) then raise exception 'NOT_ALLOWED'; end if;
  v_other := case when v_thread.user_a = v_user then v_thread.user_b else v_thread.user_a end;
  if public.direct_users_blocked(v_user, v_other) then raise exception 'USER_BLOCKED'; end if;
  insert into public.direct_messages(thread_id, sender_id, body)
  values(p_thread_id, v_user, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.start_direct_call(p_campfire_id uuid, p_target_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id is null or p_target_user_id = v_user then raise exception 'INVALID_TARGET'; end if;
  if not public.is_active_campfire_member(p_campfire_id, v_user)
     or not public.is_active_campfire_member(p_campfire_id, p_target_user_id) then
    raise exception 'TARGET_NOT_ACTIVE_MEMBER';
  end if;
  if public.direct_users_blocked(v_user, p_target_user_id) then raise exception 'USER_BLOCKED'; end if;

  update public.direct_call_sessions
  set status='ended', ended_at=now()
  where status in ('ringing','active')
    and ((caller_id=v_user and callee_id=p_target_user_id) or (caller_id=p_target_user_id and callee_id=v_user));

  insert into public.direct_call_sessions(campfire_id, caller_id, callee_id)
  values(p_campfire_id, v_user, p_target_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_direct_call(p_call_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.direct_call_sessions
  set status = case when p_accept then 'active' else 'declined' end,
      answered_at = case when p_accept then now() else answered_at end,
      ended_at = case when p_accept then null else now() end
  where id=p_call_id and callee_id=v_user and status='ringing';
  if not found then raise exception 'CALL_NOT_AVAILABLE'; end if;
end;
$$;

create or replace function public.end_direct_call(p_call_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.direct_call_sessions
  set status='ended', ended_at=now()
  where id=p_call_id and (caller_id=v_user or callee_id=v_user) and status in ('ringing','active');
  if not found then raise exception 'CALL_NOT_AVAILABLE'; end if;
end;
$$;

create or replace function public.invite_user_to_campfire(p_campfire_id uuid, p_target_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_user_id is null or p_target_user_id=v_user then raise exception 'INVALID_TARGET'; end if;
  if not public.is_active_campfire_member(p_campfire_id, v_user) then raise exception 'NOT_MEMBER'; end if;
  if public.is_active_campfire_member(p_campfire_id, p_target_user_id) then raise exception 'ALREADY_MEMBER'; end if;
  if public.direct_users_blocked(v_user, p_target_user_id) then raise exception 'USER_BLOCKED'; end if;
  if not exists(
    select 1 from public.friendships f
    where f.status='accepted'
      and ((f.requester_id=v_user and f.addressee_id=p_target_user_id)
        or (f.requester_id=p_target_user_id and f.addressee_id=v_user))
  ) then raise exception 'NOT_FRIEND'; end if;
  if exists(select 1 from public.campfire_bans b where b.campfire_id=p_campfire_id and b.user_id=p_target_user_id) then
    raise exception 'USER_BANNED';
  end if;
  if not exists(
    select 1 from public.campfire_invites i
    where i.campfire_id=p_campfire_id and i.invitee_id=p_target_user_id and i.status='pending'
  ) then
    insert into public.campfire_invites(campfire_id, inviter_id, invitee_id, status)
    values(p_campfire_id, v_user, p_target_user_id, 'pending');
  end if;
end;
$$;

create or replace function public.set_campfire_member_role(
  p_campfire_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_role text := lower(btrim(coalesce(p_role,'')));
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if v_role not in ('member','moderator','presenter') then raise exception 'INVALID_ROLE'; end if;
  if p_target_user_id=v_actor then raise exception 'OWNER_ROLE_FIXED'; end if;
  update public.campfire_members set role=v_role
  where campfire_id=p_campfire_id and user_id=p_target_user_id and left_at is null;
  if not found then raise exception 'TARGET_NOT_ACTIVE_MEMBER'; end if;
  insert into public.campfire_moderation_log(campfire_id,actor_user_id,target_user_id,action,metadata)
  values(p_campfire_id,v_actor,p_target_user_id,'set_role',jsonb_build_object('role',v_role));
end;
$$;

create or replace function public.kick_campfire_member(p_campfire_id uuid, p_target_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if p_target_user_id=v_actor then raise exception 'CANNOT_MODERATE_OWNER'; end if;
  update public.campfire_members set left_at=now()
  where campfire_id=p_campfire_id and user_id=p_target_user_id and left_at is null;
  if not found then raise exception 'TARGET_NOT_ACTIVE_MEMBER'; end if;
  insert into public.campfire_moderation_log(campfire_id,actor_user_id,target_user_id,action)
  values(p_campfire_id,v_actor,p_target_user_id,'kick');
end;
$$;

create or replace function public.ban_campfire_member(p_campfire_id uuid, p_target_user_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_campfire_owner(p_campfire_id, v_actor) then raise exception 'NOT_CAMPFIRE_OWNER'; end if;
  if p_target_user_id=v_actor then raise exception 'CANNOT_MODERATE_OWNER'; end if;
  insert into public.campfire_bans(campfire_id,user_id,banned_by,reason)
  values(p_campfire_id,p_target_user_id,v_actor,nullif(btrim(coalesce(p_reason,'')),''))
  on conflict(campfire_id,user_id) do update set banned_by=excluded.banned_by, reason=excluded.reason, created_at=now();
  update public.campfire_members set left_at=now()
  where campfire_id=p_campfire_id and user_id=p_target_user_id and left_at is null;
  insert into public.campfire_moderation_log(campfire_id,actor_user_id,target_user_id,action,metadata)
  values(p_campfire_id,v_actor,p_target_user_id,'ban',jsonb_build_object('reason',p_reason));
end;
$$;

create or replace function public.prevent_banned_campfire_activation()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.left_at is null and exists(
    select 1 from public.campfire_bans b where b.campfire_id=new.campfire_id and b.user_id=new.user_id
  ) then raise exception 'USER_BANNED'; end if;
  return new;
end;
$$;
drop trigger if exists campfire_prevent_banned_activation on public.campfire_members;
create trigger campfire_prevent_banned_activation
before insert or update of left_at on public.campfire_members
for each row execute function public.prevent_banned_campfire_activation();

create or replace function public.require_owner_transfer_before_leave()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.left_at is null and new.left_at is not null
     and exists(select 1 from public.campfires c where c.id = old.campfire_id and c.owner_id = old.user_id)
     and exists(
       select 1 from public.campfire_members m
       where m.campfire_id = old.campfire_id and m.user_id <> old.user_id and m.left_at is null
     ) then
    raise exception 'OWNER_TRANSFER_REQUIRED';
  end if;
  return new;
end;
$$;
drop trigger if exists campfire_owner_transfer_before_leave on public.campfire_members;
create trigger campfire_owner_transfer_before_leave
before update of left_at on public.campfire_members
for each row execute function public.require_owner_transfer_before_leave();

alter table public.campfire_voice_channels enable row level security;
alter table public.campfire_member_media_state enable row level security;
alter table public.campfire_moderation_log enable row level security;
alter table public.user_private_relationship_settings enable row level security;
alter table public.user_blocks enable row level security;
alter table public.campfire_bans enable row level security;
alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_call_sessions enable row level security;
alter table public.campfire_identity_keys enable row level security;

create policy "campfire_voice_channels_members_read" on public.campfire_voice_channels
for select to authenticated using (public.is_active_campfire_member(campfire_id));
create policy "campfire_media_state_members_read" on public.campfire_member_media_state
for select to authenticated using (public.is_active_campfire_member(campfire_id));
create policy "campfire_moderation_owner_read" on public.campfire_moderation_log
for select to authenticated using (public.is_campfire_owner(campfire_id));
create policy "private_relationship_owner_all" on public.user_private_relationship_settings
for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());
create policy "user_blocks_owner_all" on public.user_blocks
for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy "campfire_bans_owner_read" on public.campfire_bans
for select to authenticated using(public.is_campfire_owner(campfire_id));
create policy "direct_threads_participants_read" on public.direct_threads
for select to authenticated using(auth.uid()=user_a or auth.uid()=user_b);
create policy "direct_messages_participants_read" on public.direct_messages
for select to authenticated using(exists(
  select 1 from public.direct_threads t where t.id=thread_id and (t.user_a=auth.uid() or t.user_b=auth.uid())
));
create policy "direct_call_participants_read" on public.direct_call_sessions
for select to authenticated using(auth.uid()=caller_id or auth.uid()=callee_id);
create policy "identity_keys_authenticated_read" on public.campfire_identity_keys
for select to authenticated using(true);
create policy "identity_keys_owner_write" on public.campfire_identity_keys
for insert to authenticated with check(user_id=auth.uid());
create policy "identity_keys_owner_update" on public.campfire_identity_keys
for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Realtime is required for incoming direct messages/calls and live moderation/channel state.
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.direct_call_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.campfire_member_media_state; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.campfire_voice_channels; exception when duplicate_object then null; end $$;

grant execute on function public.create_campfire_voice_channel(uuid,text) to authenticated;
grant execute on function public.rename_campfire_voice_channel(uuid,uuid,text) to authenticated;
grant execute on function public.delete_campfire_voice_channel(uuid,uuid) to authenticated;
grant execute on function public.send_campfire_friend_request(uuid) to authenticated;
grant execute on function public.transfer_campfire_ownership(uuid,uuid) to authenticated;
grant execute on function public.set_campfire_member_moderation(uuid,uuid,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.move_campfire_voice_member(uuid,uuid,uuid) to authenticated;
grant execute on function public.disconnect_campfire_voice_member(uuid,uuid) to authenticated;
grant execute on function public.upsert_user_private_relationship_setting(uuid,text,text,boolean) to authenticated;
grant execute on function public.set_user_block(uuid,boolean) to authenticated;
grant execute on function public.get_or_create_direct_thread(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid,text) to authenticated;
grant execute on function public.start_direct_call(uuid,uuid) to authenticated;
grant execute on function public.respond_direct_call(uuid,boolean) to authenticated;
grant execute on function public.end_direct_call(uuid) to authenticated;
grant execute on function public.invite_user_to_campfire(uuid,uuid) to authenticated;
grant execute on function public.set_campfire_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.kick_campfire_member(uuid,uuid) to authenticated;
grant execute on function public.ban_campfire_member(uuid,uuid,text) to authenticated;

commit;
notify pgrst, 'reload schema';
