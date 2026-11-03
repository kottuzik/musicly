-- Milestone 9, step 2: delete, restore, purge, history deletion (ADR-17).
-- Business errors are raised with errcode P0001 and a stable message key that the app maps to Hebrew.

-- ---------------------------------------------------------------------------
-- Permission to delete a student's remaining history (PRD §4.3): the Super Admin, or an Admin who
-- was given the permission explicitly.
-- ---------------------------------------------------------------------------

create function public.can_delete_student_history()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.current_user_role()
    when 'super_admin' then true
    when 'admin' then coalesce(
      (select ap.delete_student_history from public.admin_permissions ap where ap.profile_id = (select auth.uid())),
      false)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Reactivating a teacher chooses what happens to their weekly availability (PRD §4.4):
--   'restore' keeps the old slots that still fit the school's current operating hours;
--   'fresh'   clears them and asks the teacher to set new ones.
-- ---------------------------------------------------------------------------

drop function public.set_teacher_status(uuid, public.user_status);

create function public.set_teacher_status(
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
begin
  perform public.require_admin();

  select status, profile_id into v_old, v_profile from public.teachers where id = p_teacher_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_reactivated := p_status = 'active' and v_old = 'inactive';
  if v_reactivated and p_availability_mode is distinct from 'restore' and p_availability_mode is distinct from 'fresh' then
    raise exception 'availability_mode_required' using errcode = 'P0001';
  end if;

  update public.teachers set status = p_status where id = p_teacher_id;

  if v_profile is not null then
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

-- ---------------------------------------------------------------------------
-- Soft delete and restore
-- ---------------------------------------------------------------------------

-- Deleting a student deactivates them first (future lessons cancelled, hours freed), then hides them
-- for 30 days.
create function public.delete_student(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
begin
  perform public.require_admin();

  select deleted_at into v_deleted from public.students where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_deleted is not null then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;

  perform public.set_student_status(p_id, 'inactive', null, null);

  update public.students
  set deleted_at = now(), purge_after = now() + interval '30 days', deleted_by = (select auth.uid())
  where id = p_id;

  perform public.log_event('student', p_id, 'student_deleted', null, null);
end;
$$;

-- Restoring brings the profile back as active or inactive. Lessons are not brought back (PRD §4.3).
create function public.restore_student(p_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  perform public.require_admin();

  select * into s from public.students where id = p_id for update;
  if not found or s.deleted_at is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.anonymized_at is not null or s.purge_after <= now() then
    raise exception 'restore_window_closed' using errcode = 'P0001';
  end if;

  update public.students
  set deleted_at = null, purge_after = null, deleted_by = null, status = p_status
  where id = p_id;

  perform public.log_event('student', p_id, 'student_restored', null, jsonb_build_object('status', p_status));
end;
$$;

-- Deleting a teacher deactivates them (upcoming lessons flagged for attention) and blocks their sign-in.
create function public.delete_teacher(p_id uuid)
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

create function public.restore_teacher(p_id uuid, p_status public.user_status, p_availability_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teachers;
begin
  perform public.require_admin();

  select * into t from public.teachers where id = p_id for update;
  if not found or t.deleted_at is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if t.anonymized_at is not null or t.purge_after <= now() then
    raise exception 'restore_window_closed' using errcode = 'P0001';
  end if;
  if p_status = 'active' and p_availability_mode is distinct from 'restore' and p_availability_mode is distinct from 'fresh' then
    raise exception 'availability_mode_required' using errcode = 'P0001';
  end if;

  update public.teachers set deleted_at = null, purge_after = null, deleted_by = null where id = p_id;
  if t.profile_id is not null then
    update public.profiles set deleted_at = null where id = t.profile_id;
  end if;

  if p_status = 'active' then
    perform public.set_teacher_status(p_id, 'active', p_availability_mode);
  end if;

  perform public.log_event('teacher', p_id, 'teacher_restored', null, jsonb_build_object('status', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Final deletion: removes everything about the person except the name and the lessons that point
-- at them. A row nobody points at any more is removed too.
-- ---------------------------------------------------------------------------

create function public.purge_student(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.person_maintenance_on();

  -- Free-text notes about the student are not part of the minimal history.
  update public.attendance set note = null
  where lesson_id in (select id from public.lessons where student_id = p_id) and note is not null;
  delete from public.lesson_change_requests
  where lesson_id in (select id from public.lessons where student_id = p_id);
  delete from public.exception_booking_requests where student_id = p_id;
  delete from public.student_contacts where student_id = p_id;
  delete from public.student_subjects where student_id = p_id;

  update public.students
  set birth_date = null, status = 'inactive', expected_return_date = null, return_mode = null,
      return_notified_at = null, anonymized_at = now()
  where id = p_id;

  if not exists (select 1 from public.lessons where student_id = p_id)
     and not exists (select 1 from public.lesson_series where student_id = p_id) then
    delete from public.students where id = p_id;
  end if;

  perform public.log_event('student', p_id, 'person_purged', null, null);
end;
$$;

create function public.purge_teacher(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teachers;
begin
  perform public.person_maintenance_on();

  select * into t from public.teachers where id = p_id;
  if not found then
    return;
  end if;

  delete from public.teacher_skills where teacher_id = p_id;
  delete from public.teacher_availability where teacher_id = p_id;
  delete from public.teacher_absences where teacher_id = p_id;
  delete from public.availability_requests where teacher_id = p_id;
  delete from public.lesson_change_requests where teacher_id = p_id;
  delete from public.exception_booking_requests where teacher_id = p_id;
  delete from public.reminder_jobs where teacher_id = p_id;
  delete from public.lesson_reminder_overrides where teacher_id = p_id;
  delete from public.reminder_preferences where teacher_id = p_id;
  delete from public.invitations where teacher_id = p_id or email = t.email;
  delete from public.email_outbox where (t.profile_id is not null and user_id = t.profile_id) or to_email = t.email;

  update public.teachers
  set profile_id = null, email = null, phone = null, status = 'inactive', anonymized_at = now()
  where id = p_id;

  -- The sign-in account goes last; its profile, preferences and notifications go with it.
  if t.profile_id is not null then
    delete from auth.users where id = t.profile_id;
  end if;

  if not exists (select 1 from public.lessons where teacher_id = p_id)
     and not exists (select 1 from public.lesson_series where teacher_id = p_id)
     and not exists (select 1 from public.student_subjects where regular_teacher_id = p_id) then
    delete from public.teachers where id = p_id;
  end if;

  perform public.log_event('teacher', p_id, 'person_purged', null, null);
end;
$$;

-- The daily job: purges everyone whose 30 days are over. One failure never stops the others.
create function public.purge_soft_deleted_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_done integer := 0;
  v_failed integer := 0;
begin
  for r in
    select 'student'::text as kind, id from public.students
    where deleted_at is not null and anonymized_at is null and purge_after <= now()
    union all
    select 'teacher', id from public.teachers
    where deleted_at is not null and anonymized_at is null and purge_after <= now()
  loop
    begin
      if r.kind = 'student' then
        perform public.purge_student(r.id);
      else
        perform public.purge_teacher(r.id);
      end if;
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      perform public.job_finish('purge_soft_deleted_records', false,
        jsonb_build_object('kind', r.kind, 'id', r.id, 'error', sqlstate));
    end;
  end loop;

  if v_done > 0 then
    perform public.job_finish('purge_soft_deleted_records', true, jsonb_build_object('purged', v_done, 'failed', v_failed));
  end if;
  return v_done;
end;
$$;

-- A deleted teacher's series cannot get new lessons: leave them out of the rolling-window job.
create or replace function public.extend_recurring_lessons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_skipped jsonb;
  v_series integer := 0;
  v_problems integer := 0;
begin
  for s in
    select ls.id, ls.end_date from public.lesson_series ls
    where ls.status = 'active' and ls.generated_until < public.series_window_end(ls.end_date)
      and not exists (select 1 from public.teachers t where t.id = ls.teacher_id and t.deleted_at is not null)
  loop
    begin
      v_skipped := public.generate_series_occurrences(s.id, public.series_window_end(s.end_date));
      v_series := v_series + 1;
      if jsonb_array_length(v_skipped) > 0 then
        v_problems := v_problems + 1;
        perform public.notify_admins(
          'series_extension_conflicts', 'system', 'series', s.id,
          jsonb_build_object('series_id', s.id, 'count', jsonb_array_length(v_skipped)),
          'ext:' || s.id || ':' || public.school_today());
      end if;
    exception when others then
      perform public.job_finish('extend_recurring_lessons', false, jsonb_build_object('series', s.id, 'error', sqlstate));
    end;
  end loop;

  if v_series > 0 then
    perform public.job_finish('extend_recurring_lessons', true, jsonb_build_object('extended', v_series, 'with_conflicts', v_problems));
  end if;
  return v_series;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting the remaining history of a person who was already purged (PRD §4.3, §4.4, §7)
-- ---------------------------------------------------------------------------

-- A student's lessons belong to that student alone (no group lessons), so they all go, with their
-- attendance, reminders, log entries and notifications. Nobody else's data is touched.
create function public.delete_student_history(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_lessons uuid[];
  v_series uuid[];
  v_requests uuid[];
  v_ids uuid[];
  v_texts text[];
begin
  perform public.require_admin();
  if not public.can_delete_student_history() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into s from public.students where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.anonymized_at is null then
    raise exception 'not_purged' using errcode = 'P0001';
  end if;

  perform public.person_maintenance_on();

  select coalesce(array_agg(id), '{}') into v_lessons from public.lessons where student_id = p_id;
  select coalesce(array_agg(id), '{}') into v_series from public.lesson_series where student_id = p_id;
  select coalesce(array_agg(id), '{}') into v_requests from public.lesson_change_requests where lesson_id = any(v_lessons);
  v_ids := v_lessons || v_series || v_requests || p_id;
  select coalesce(array_agg(x::text), '{}') into v_texts from unnest(v_ids) x;

  delete from public.audit_events where entity_id = any(v_ids);
  delete from public.notifications
  where entity_id = any(v_ids) or payload ->> 'lesson_id' = any(v_texts) or payload ->> 'series_id' = any(v_texts);
  delete from public.email_outbox where payload ->> 'lesson_id' = any(v_texts);
  delete from public.exception_booking_requests where student_id = p_id;
  delete from public.lessons where student_id = p_id;
  delete from public.lesson_series where student_id = p_id;
  delete from public.students where id = p_id;

  -- Only the fact that it happened is kept: who, when and how many. A fresh random id stands in for
  -- the person so the deleted identity is not stored again.
  perform public.log_event('student', gen_random_uuid(), 'history_deleted', null,
    jsonb_build_object('kind', 'student', 'lessons', cardinality(v_lessons)));
  return cardinality(v_lessons);
end;
$$;

-- A teacher's lessons are shared with students, so they stay (PRD §7); only the teacher's identity
-- goes: the name becomes "מורה שנמחק" and log entries and notifications about the teacher are removed.
create function public.delete_teacher_history(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teachers;
  v_lessons integer;
begin
  perform public.require_admin();

  select * into t from public.teachers where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if t.anonymized_at is null then
    raise exception 'not_purged' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.lessons l where l.teacher_id = p_id and l.status = 'scheduled' and l.end_at > now()
  ) then
    raise exception 'has_future_lessons' using errcode = 'P0001';
  end if;

  perform public.person_maintenance_on();

  select count(*) into v_lessons from public.lessons where teacher_id = p_id;

  delete from public.audit_events where entity = 'teacher' and entity_id = p_id;
  delete from public.notifications where entity = 'teacher' and entity_id = p_id;

  if exists (select 1 from public.lessons where teacher_id = p_id)
     or exists (select 1 from public.lesson_series where teacher_id = p_id)
     or exists (select 1 from public.student_subjects where regular_teacher_id = p_id) then
    update public.teachers set full_name = 'מורה שנמחק' where id = p_id;
  else
    delete from public.teachers where id = p_id;
  end if;

  perform public.log_event('teacher', gen_random_uuid(), 'history_deleted', null,
    jsonb_build_object('kind', 'teacher', 'lessons', v_lessons));
  return v_lessons;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists for the "recently deleted" tabs (admins only, no contact details)
-- ---------------------------------------------------------------------------

-- Deleted within the last 30 days (restorable), and purged people who still have lessons in the
-- history (their remaining history can be deleted).
create function public.list_deleted_people(p_kind text)
returns table (
  id uuid, full_name text, deleted_at timestamptz, purge_after timestamptz,
  days_left integer, purged boolean, lessons bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  if p_kind = 'student' then
    return query
    select s.id, s.full_name, s.deleted_at, s.purge_after,
           greatest(0, ceil(extract(epoch from (s.purge_after - now())) / 86400))::integer,
           s.anonymized_at is not null,
           (select count(*) from public.lessons l where l.student_id = s.id)
    from public.students s
    where s.deleted_at is not null
    order by s.deleted_at desc;
  elsif p_kind = 'teacher' then
    return query
    select t.id, t.full_name, t.deleted_at, t.purge_after,
           greatest(0, ceil(extract(epoch from (t.purge_after - now())) / 86400))::integer,
           t.anonymized_at is not null,
           (select count(*) from public.lessons l where l.teacher_id = t.id)
    from public.teachers t
    where t.deleted_at is not null
    order by t.deleted_at desc;
  else
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- An inactive teacher may see their own lesson history, and nothing else (PRD §2.1, §4.4).
-- The role is null for an inactive account, so the rest of the system already refuses them.
-- ---------------------------------------------------------------------------

create function public.inactive_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.teachers t
  join public.profiles p on p.id = t.profile_id
  where p.id = (select auth.uid())
    and p.role = 'teacher'
    and p.status = 'inactive'
    and p.deleted_at is null;
$$;

create or replace function public.list_history_lessons(
  p_student_id uuid, p_teacher_id uuid, p_from timestamptz, p_to timestamptz
)
returns table (
  id uuid, version integer, start_at timestamptz, end_at timestamptz, status public.lesson_status,
  location public.lesson_location, student_id uuid, student_name text, teacher_id uuid,
  teacher_name text, lesson_type_name text, color text,
  attendance_status public.attendance_status, attendance_note text, attendance_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_teacher uuid := p_teacher_id;
  v_past_only boolean := false;
begin
  if v_role is null then
    -- An inactive teacher: own lessons that already ended.
    v_teacher := public.inactive_teacher_id();
    if v_teacher is null then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    v_past_only := true;
  elsif v_role = 'teacher' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;

  return query
  select l.id, l.version, l.start_at, l.end_at, l.status, l.location, l.student_id, s.full_name,
         l.teacher_id, t.full_name, lt.name, lt.color, a.status, a.note, a.version
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.attendance a on a.lesson_id = l.id
  where l.start_at >= p_from and l.start_at < p_to
    and (p_student_id is null or l.student_id = p_student_id)
    and (v_teacher is null or l.teacher_id = v_teacher)
    and (not v_past_only or l.end_at <= now())
  order by l.start_at desc
  limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.person_maintenance_on(),
  public.guard_deleted_person_row(),
  public.guard_deleted_reference(),
  public.can_delete_student_history(),
  public.set_teacher_status(uuid, public.user_status, text),
  public.delete_student(uuid),
  public.restore_student(uuid, public.user_status),
  public.delete_teacher(uuid),
  public.restore_teacher(uuid, public.user_status, text),
  public.purge_student(uuid),
  public.purge_teacher(uuid),
  public.purge_soft_deleted_records(),
  public.delete_student_history(uuid),
  public.delete_teacher_history(uuid),
  public.list_deleted_people(text),
  public.inactive_teacher_id()
from public, anon, authenticated;

grant execute on function
  public.can_delete_student_history(),
  public.set_teacher_status(uuid, public.user_status, text),
  public.delete_student(uuid),
  public.restore_student(uuid, public.user_status),
  public.delete_teacher(uuid),
  public.restore_teacher(uuid, public.user_status, text),
  public.delete_student_history(uuid),
  public.delete_teacher_history(uuid),
  public.list_deleted_people(text)
to authenticated;
