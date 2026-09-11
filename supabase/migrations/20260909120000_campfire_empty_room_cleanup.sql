-- Campfire R6.6 — authoritative empty-room lifecycle.
-- Temporary rooms get exactly five minutes after the last active member leaves.
-- Any rejoin clears the deadline. Persistent/VIP rooms never expire here.

begin;

create or replace function public.refresh_campfire_empty_deadline(p_campfire_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
  v_persistent boolean;
begin
  select c.persistent
    into v_persistent
    from public.campfires c
   where c.id = p_campfire_id
   for update;

  if not found then
    return;
  end if;

  if coalesce(v_persistent, false) then
    update public.campfires
       set empty_since = null,
           expires_at = null
     where id = p_campfire_id;
    return;
  end if;

  select count(*)::integer
    into v_active_count
    from public.campfire_members m
   where m.campfire_id = p_campfire_id
     and m.left_at is null;

  if v_active_count = 0 then
    update public.campfires
       set empty_since = coalesce(empty_since, now()),
           expires_at = coalesce(expires_at, now() + interval '5 minutes')
     where id = p_campfire_id
       and persistent = false;
  else
    update public.campfires
       set empty_since = null,
           expires_at = null
     where id = p_campfire_id;
  end if;
end;
$$;

create or replace function public.campfire_members_refresh_empty_deadline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campfire_id uuid;
begin
  v_campfire_id := coalesce(new.campfire_id, old.campfire_id);
  perform public.refresh_campfire_empty_deadline(v_campfire_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists campfire_members_empty_deadline on public.campfire_members;
create trigger campfire_members_empty_deadline
after insert or update of left_at or delete on public.campfire_members
for each row execute function public.campfire_members_refresh_empty_deadline();

create or replace function public.cleanup_expired_campfires()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  with deleted as (
    delete from public.campfires c
     where c.persistent = false
       and c.expires_at is not null
       and c.expires_at <= now()
       and not exists (
         select 1
           from public.campfire_members m
          where m.campfire_id = c.id
            and m.left_at is null
       )
    returning c.id
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.refresh_campfire_empty_deadline(uuid) from public;
revoke all on function public.cleanup_expired_campfires() from public;
grant execute on function public.refresh_campfire_empty_deadline(uuid) to service_role;
grant execute on function public.cleanup_expired_campfires() to service_role;

-- Supabase supports pg_cron. Scheduling is idempotent so re-running the
-- migration cannot create multiple cleanup jobs.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'campfire-empty-room-cleanup'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'campfire-empty-room-cleanup',
  '* * * * *',
  'select public.cleanup_expired_campfires();'
);

commit;
