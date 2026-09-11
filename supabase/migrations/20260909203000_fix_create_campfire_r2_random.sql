-- Campfire hotfix: corrigir criacao de Campfire no Supabase
-- Causa: gen_random_bytes(8) nao era visivel no search_path da RPC.
-- Correcao: usa gen_random_uuid(), que ja esta disponivel nesse ambiente.
begin;

create or replace function public.create_campfire_r2(
  p_name text,
  p_privacy text,
  p_invitee_ids uuid[] default '{}'::uuid[],
  p_persistent boolean default false,
  p_cover_kind text default 'preset',
  p_cover_ref text default 'cinema-night'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_privacy text := lower(btrim(coalesce(p_privacy, 'private')));
  v_cover_kind text := lower(btrim(coalesce(p_cover_kind, 'preset')));
  v_cover_ref text := btrim(coalesce(p_cover_ref, ''));
  v_id uuid := gen_random_uuid();
  v_invite_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_invitee uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'INVALID_CAMPFIRE_NAME';
  end if;

  if v_privacy not in ('private', 'friends', 'link') then
    raise exception 'INVALID_PRIVACY';
  end if;

  if v_cover_kind not in ('preset', 'storage', 'web') then
    raise exception 'INVALID_COVER_KIND';
  end if;

  if char_length(v_cover_ref) < 1 or char_length(v_cover_ref) > 2048 then
    raise exception 'INVALID_COVER_REF';
  end if;

  if v_cover_kind = 'web' and v_cover_ref !~* '^https?://' then
    raise exception 'INVALID_COVER_REF';
  end if;

  foreach v_invitee in array coalesce(p_invitee_ids, '{}'::uuid[])
  loop
    if v_invitee = v_user then
      raise exception 'CANNOT_INVITE_SELF';
    end if;

    if not exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = v_user and f.addressee_id = v_invitee)
          or
          (f.addressee_id = v_user and f.requester_id = v_invitee)
        )
    ) then
      raise exception 'NOT_FRIEND';
    end if;
  end loop;

  insert into public.campfires (
    id,
    name,
    owner_id,
    leader_id,
    privacy,
    persistent,
    invite_code,
    created_at,
    empty_since,
    expires_at,
    cover_kind,
    cover_ref
  )
  values (
    v_id,
    v_name,
    v_user,
    v_user,
    v_privacy,
    coalesce(p_persistent, false),
    v_invite_code,
    now(),
    null,
    null,
    v_cover_kind,
    v_cover_ref
  );

  insert into public.campfire_members (
    campfire_id,
    user_id,
    joined_at,
    left_at
  )
  values (
    v_id,
    v_user,
    now(),
    null
  );

  insert into public.campfire_invites (
    campfire_id,
    inviter_id,
    invitee_id,
    status
  )
  select
    v_id,
    v_user,
    invitee_id,
    'pending'
  from (
    select distinct unnest(coalesce(p_invitee_ids, '{}'::uuid[])) as invitee_id
  ) q
  where invitee_id is not null
    and invitee_id <> v_user;

  return v_id;
end;
$$;

revoke all on function public.create_campfire_r2(text,text,uuid[],boolean,text,text) from public;
grant execute on function public.create_campfire_r2(text,text,uuid[],boolean,text,text) to authenticated;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.create_campfire_r2(text,text,uuid[],boolean,text,text)'::regprocedure
  )
  into v_def;

  if v_def ilike '%gen_random_bytes(%' then
    raise exception 'HOTFIX_FAILED: create_campfire_r2 ainda referencia gen_random_bytes';
  end if;

  if v_def not ilike '%gen_random_uuid()%' then
    raise exception 'HOTFIX_FAILED: create_campfire_r2 nao referencia gen_random_uuid';
  end if;
end;
$$;

commit;
