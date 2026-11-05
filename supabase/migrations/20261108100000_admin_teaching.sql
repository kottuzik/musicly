-- Milestone 12: an admin or super admin may also teach from the same account (ADR-21).
-- A teaching admin is a teachers row linked to their profile. Teaching status lives on that row
-- and never changes the admin account. Safe with the previous code: nothing changes until a
-- teachers row is linked to an admin, and no such row exists before this feature is used.

-- ---------------------------------------------------------------------------
-- Identity: every active user with a linked teachers row is that teacher
-- ---------------------------------------------------------------------------

-- Read functions keep branching on the role, so an admin still sees everything.
create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.teachers t
  where t.profile_id = (select auth.uid())
    and public.current_user_role() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Turning teaching on and off
-- ---------------------------------------------------------------------------

create function public.is_admin_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teachers t
    join public.profiles p on p.id = t.profile_id
    where t.id = p_teacher_id and p.role in ('super_admin', 'admin')
  );
$$;

-- Only the admin themself or the super admin may turn someone's teaching on or off.
create function public.require_teaching_manager(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_profile_id is distinct from (select auth.uid()) then
    perform public.require_super_admin();
  end if;
end;
$$;

-- Same signature as M9. Teaching status of an admin never touches their account.
create or replace function public.set_teacher_status(
  p_teacher_id uuid,
  p_status public.user_status,
  p_availability_mode text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_old public.user_status;
  v_flagged integer;
  v_removed integer := 0;
  v_reactivated boolean;
  v_admin_teacher boolean;
begin
  perform public.require_admin();

  select status, profile_id into v_old, v_profile from public.teachers where id = p_teacher_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_admin_teacher := public.is_admin_teacher(p_teacher_id);
  if v_admin_teacher then
    perform public.require_teaching_manager(v_profile);
  end if;

  v_reactivated := p_status = 'active' and v_old = 'inactive';
  if v_reactivated and p_availability_mode is distinct from 'restore' and p_availability_mode is distinct from 'fresh' then
    raise exception 'availability_mode_required' using errcode = 'P0001';
  end if;

  update public.teachers set status = p_status where id = p_teacher_id;

  if v_profile is not null and not v_admin_teacher then
    update public.profiles set status = p_status where id = v_profile;
  end if;

  if p_status = 'inactive' then
    update public.lessons
    set requires_attention = true, attention_reason = 'teacher_inactive'
    where teacher_id = p_teacher_id and status = 'scheduled' and start_at > now();
    get diagnostics v_flagged = row_count;
    update public.exception_booking_requests
    set status = 'cancelled', result_note = 'המורה הושבת'
    where teacher_id = p_teacher_id and status = 'pending';
    update public.lesson_change_requests
    set status = 'cancelled', decided_at = now(), decision_note = 'המורה הושבת'
    where teacher_id = p_teacher_id and status = 'pending';
    perform public.log_event('teacher', p_teacher_id, 'teacher_deactivated', null, jsonb_build_object('flagged_lessons', v_flagged));
  end if;

  if v_reactivated then
    if p_availability_mode = 'restore' then
      delete from public.teacher_availability ta
      where ta.teacher_id = p_teacher_id
        and (ta.valid_to is null or ta.valid_to >= public.school_today())
        and not public.within_operating_hours(ta.day_of_week, ta.start_time, ta.end_time);
      get diagnostics v_removed = row_count;
    else
      delete from public.teacher_availability where teacher_id = p_teacher_id;
      perform public.notify(v_profile, 'availability_needed', 'activity', 'teacher', p_teacher_id,
        '{}'::jsonb, 'avail-needed:' || p_teacher_id || ':' || gen_random_uuid());
    end if;
    perform public.log_event('teacher', p_teacher_id, 'teacher_reactivated', null,
      jsonb_build_object('availability_mode', p_availability_mode, 'removed_slots', v_removed));
  end if;
end;
$$;

-- Creates or reactivates the admin's teachers row. On reactivation the earlier availability is
-- kept where it still fits the operating hours; cancelled lessons do not return.
create function public.enable_admin_teaching(p_profile_id uuid, p_lesson_type_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_id uuid;
  v_status public.user_status;
begin
  perform public.require_teaching_manager(p_profile_id);
  if p_lesson_type_ids is null or cardinality(p_lesson_type_ids) = 0 then
    raise exception 'skills_required' using errcode = 'P0001';
  end if;

  select * into p from public.profiles
  where id = p_profile_id and role in ('super_admin', 'admin') and status = 'active' and deleted_at is null
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select id, status into v_id, v_status from public.teachers where profile_id = p_profile_id for update;
  if not found then
    insert into public.teachers (profile_id, full_name, email, phone)
    values (p.id, p.full_name, lower(p.email), p.phone)
    returning id into v_id;
    insert into public.teacher_skills (teacher_id, lesson_type_id)
    select v_id, unnest(p_lesson_type_ids)
    on conflict do nothing;
    perform public.log_event('teacher', v_id, 'admin_teaching_enabled', null, null);
    return v_id;
  end if;

  perform public.save_teacher(v_id, p.full_name, lower(p.email), p.phone, p_lesson_type_ids);
  if v_status = 'inactive' then
    perform public.set_teacher_status(v_id, 'active', 'restore');
    perform public.log_event('teacher', v_id, 'admin_teaching_enabled', null, null);
  end if;
  return v_id;
end;
$$;

-- Future lessons stay and are flagged, as for any deactivated teacher. The admin account is untouched.
create function public.stop_admin_teaching(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_teaching_manager(p_profile_id);
  select id into v_id from public.teachers where profile_id = p_profile_id and status = 'active';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform public.set_teacher_status(v_id, 'inactive', null);
end;
$$;

-- A teaching admin is not deleted as a teacher: their teaching is stopped instead.
create or replace function public.delete_teacher(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
  v_profile uuid;
begin
  perform public.require_admin();

  select deleted_at, profile_id into v_deleted, v_profile from public.teachers where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_deleted is not null then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;
  if public.is_admin_teacher(p_id) then
    raise exception 'admin_teacher_not_deletable' using errcode = 'P0001';
  end if;

  perform public.set_teacher_status(p_id, 'inactive', null);

  update public.teachers
  set deleted_at = now(), purge_after = now() + interval '30 days', deleted_by = (select auth.uid())
  where id = p_id;
  if v_profile is not null then
    update public.profiles set deleted_at = now() where id = v_profile;
  end if;

  perform public.log_event('teacher', p_id, 'teacher_deleted', null, null);
end;
$$;

-- A deactivated admin cannot teach either: their future lessons are flagged for the other admins.
create or replace function public.set_admin_status(p_profile_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid;
begin
  perform public.require_super_admin();
  if p_profile_id = (select auth.uid()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.profiles set status = p_status where id = p_profile_id and role = 'admin';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_status = 'inactive' then
    select id into v_teacher from public.teachers where profile_id = p_profile_id and status = 'active';
    if found then
      perform public.set_teacher_status(v_teacher, 'inactive', null);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- An admin's own booking outside their availability counts as their consent
-- ---------------------------------------------------------------------------

-- Every path that asks a teacher for approval inserts a request, so answering it here covers them
-- all. The request stays in the history, and the usual re-checks run.
create function public.exception_booking_requests_self_approve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending'
     and new.requested_by = (select auth.uid())
     and new.teacher_id is not distinct from public.current_teacher_id() then
    perform public.respond_exception_request(new.id, new.version, true, null);
  end if;
  return null;
end;
$$;

create trigger exception_booking_requests_self_approve
after insert on public.exception_booking_requests
for each row execute function public.exception_booking_requests_self_approve();

-- Same as M6, except that a request the deciding admin answered for themself is already applied.
create or replace function public.apply_lesson_decision(
  p_lesson_id uuid, p_teacher uuid, p_date date, p_start time, p_reason public.attention_reason
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_duration integer;
  v_start timestamptz := public.local_ts(p_date, p_start);
  v_end_time time;
  v_request uuid;
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found or l.status <> 'scheduled' then
    raise exception 'decision_failed' using errcode = 'P0001', detail = p_lesson_id::text, hint = 'lesson_not_scheduled';
  end if;
  v_duration := (extract(epoch from (l.end_at - l.start_at)) / 60)::integer;
  v_end_time := p_start + make_interval(mins => v_duration);

  begin
    perform public.check_booking(l.student_id, l.lesson_type_id, p_teacher, p_start, v_duration, false);
    if v_start <= now() then
      raise exception 'date_past' using errcode = 'P0001';
    end if;
    if public.closure_on(p_date) then
      raise exception 'closed_day' using errcode = 'P0001';
    end if;
    if public.lesson_conflict_except(p_teacher, l.student_id, v_start, v_start + make_interval(mins => v_duration), l.id) is not null then
      raise exception 'slot_taken' using errcode = 'P0001';
    end if;
    if not public.within_operating_hours(extract(dow from p_date)::smallint, p_start, v_end_time) then
      raise exception 'outside_hours' using errcode = 'P0001';
    end if;

    if not public.teacher_covers(p_teacher, p_date, p_start, v_end_time, true) then
      if not exists (
        select 1 from public.exception_booking_requests where target_lesson_id = l.id and status = 'pending'
      ) then
        insert into public.exception_booking_requests (
          kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time,
          duration_minutes, first_start_at, outside_hours, requested_by, target_lesson_id
        )
        values (
          'lesson_change', l.student_id, l.lesson_type_id, p_teacher, l.location, p_date, p_start,
          v_duration, v_start, false, (select auth.uid()), l.id
        )
        returning id into v_request;
        if exists (select 1 from public.exception_booking_requests where id = v_request and status = 'approved') then
          return 'updated';
        end if;
      end if;
      update public.lessons set requires_attention = true, attention_reason = coalesce(attention_reason, p_reason)
      where id = l.id;
      return 'requested';
    end if;

    perform public.do_update_lesson(l.id, p_teacher, p_date, p_start, v_duration, l.location, false);
    return 'updated';
  exception when raise_exception then
    if sqlerrm = 'decision_failed' then
      raise;
    end if;
    raise exception 'decision_failed' using errcode = 'P0001', detail = p_lesson_id::text, hint = sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- An admin changes their own lessons directly, without asking anyone
-- ---------------------------------------------------------------------------

create function public.lesson_change_requests_teachers_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger lesson_change_requests_teachers_only
before insert on public.lesson_change_requests
for each row execute function public.lesson_change_requests_teachers_only();

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_admin_teacher(uuid),
  public.require_teaching_manager(uuid),
  public.enable_admin_teaching(uuid, uuid[]),
  public.stop_admin_teaching(uuid),
  public.exception_booking_requests_self_approve(),
  public.lesson_change_requests_teachers_only()
from public, anon, authenticated;

grant execute on function
  public.enable_admin_teaching(uuid, uuid[]),
  public.stop_admin_teaching(uuid)
to authenticated;
