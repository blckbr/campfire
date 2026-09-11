-- Campfire R2 — 1 Campfire = 1 call, shared cover and explicit lifecycle.
-- Additive/idempotent. Apply after the existing Campfire base schema.
begin;

create extension if not exists pgcrypto;

alter table public.campfires
  add column if not exists cover_kind text not null default 'preset';

alter table public.campfires
  add column if not exists cover_ref text not null default 'cinema-night';

alter table public.campfires
  drop constraint if exists campfires_cover_kind_check;

alter table public.campfires
  add constraint campfires_cover_kind_check
  check (cover_kind in ('preset', 'storage', 'web'));

alter table public.campfires
  drop constraint if exists campfires_cover_ref_length;

alter table public.campfires
  add constraint campfires_cover_ref_length
  check (char_length(cover_ref) between 1 and 2048);

-- Shared cover bucket. Covers are visual room identity, not private messages.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'campfire-covers',
  'campfire-covers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users can upload only into their own first-level folder.
drop policy if exists "campfire_covers_insert_own_folder" on storage.objects;
create policy "campfire_covers_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campfire-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners of the storage path may replace or delete their own uploaded cover.
drop policy if exists "campfire_covers_update_own_folder" on storage.objects;
create policy "campfire_covers_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campfire-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'campfire-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "campfire_covers_delete_own_folder" on storage.objects;
create policy "campfire_covers_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campfire-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Keep empty lifecycle state server-side. Existing get_my_campfires/leave/rejoin
-- logic continues to own visibility; this trigger makes permanent/temporary state
-- explicit and ensures the temporary deadline is always five minutes.
create or replace function public.campfire_r2_sync_empty_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campfire_id uuid := coalesce(new.campfire_id, old.campfire_id);
  v_persistent boolean;
begin
  select c.persistent
    into v_persistent
  from public.campfires c
  where c.id = v_campfire_id
  for update;

  if not found then
    return coalesce(new, old);
  end if;

  if v_persistent then
    update public.campfires
    set empty_since = null,
        expires_at = null
    where id = v_campfire_id;
    return coalesce(new, old);
  end if;

  if exists (
    select 1
    from public.campfire_members m
    where m.campfire_id = v_campfire_id
      and m.left_at is null
  ) then
    update public.campfires
    set empty_since = null,
        expires_at = null
    where id = v_campfire_id;
  else
    update public.campfires
    set empty_since = coalesce(empty_since, now()),
        expires_at = coalesce(expires_at, now() + interval '5 minutes')
    where id = v_campfire_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists campfire_r2_member_lifecycle on public.campfire_members;
create trigger campfire_r2_member_lifecycle
after insert or update of left_at or delete on public.campfire_members
for each row execute function public.campfire_r2_sync_empty_lifecycle();

-- New R2 create path. It intentionally does not expose internal voice channels:
-- the product rule is one Campfire = one LiveKit call.
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
  v_invite_code text := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
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

-- Visual metadata is deliberately separate from get_my_campfires so the R2
-- migration remains additive and does not change an existing RPC return type.
create or replace function public.get_my_campfire_visuals()
returns table (
  campfire_id uuid,
  cover_kind text,
  cover_ref text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct
    c.id,
    coalesce(c.cover_kind, 'preset'),
    coalesce(c.cover_ref, 'cinema-night')
  from public.campfires c
  where auth.uid() is not null
    and (
      c.owner_id = auth.uid()
      or exists (
        select 1
        from public.campfire_members m
        where m.campfire_id = c.id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.campfire_invites i
        where i.campfire_id = c.id
          and i.invitee_id = auth.uid()
          and i.status = 'pending'
      )
    );
$$;

revoke all on function public.get_my_campfire_visuals() from public;
grant execute on function public.get_my_campfire_visuals() to authenticated;

commit;

notify pgrst, 'reload schema';
