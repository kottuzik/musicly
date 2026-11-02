-- Milestone 7, step 3: reads. Calendar and lesson details gain the attendance report; new reads for
-- a person's lesson history, lessons still waiting for a report, dashboard totals and the admin
-- activity log. Names are looked up when read (the audit log holds none).

drop function public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean, boolean);

create function public.list_calendar_lessons(
  p_from timestamptz,
  p_to timestamptz,
  p_teacher_id uuid,
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_include_cancelled boolean,
  p_attention_only boolean default false
)
returns table (
  id uuid, series_id uuid, start_at timestamptz, end_at timestamptz, status public.lesson_status,
  location public.lesson_location, requires_attention boolean, student_id uuid, student_name text,
  teacher_id uuid, teacher_name text, lesson_type_id uuid, lesson_type_name text, color text,
  attention_reason public.attention_reason, attendance_status public.attendance_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_teacher uuid := p_teacher_id;
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.current_teacher_id();
  end if;

  return query
  select l.id, l.series_id, l.start_at, l.end_at, l.status, l.location, l.requires_attention,
         l.student_id, s.full_name, l.teacher_id, t.full_name, l.lesson_type_id, lt.name, lt.color,
         case when v_role = 'teacher' then null else l.attention_reason end,
         a.status
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.attendance a on a.lesson_id = l.id
  where l.start_at < p_to and l.end_at > p_from
    and (v_teacher is null or l.teacher_id = v_teacher)
    and (p_student_id is null or l.student_id = p_student_id)
    and (p_lesson_type_id is null or l.lesson_type_id = p_lesson_type_id)
    and (coalesce(p_include_cancelled, false) or l.status <> 'cancelled')
    and (not (coalesce(p_attention_only, false) and v_role <> 'teacher') or l.requires_attention)
  order by l.start_at;
end;
$$;

drop function public.get_lesson(uuid);

create function public.get_lesson(p_id uuid)
returns table (
  id uuid, series_id uuid, start_at timestamptz, end_at timestamptz, status public.lesson_status,
  location public.lesson_location, outside_hours boolean, student_id uuid, student_name text,
  teacher_id uuid, teacher_name text, is_substitute boolean, lesson_type_name text, color text,
  series_day smallint, series_start_time time, series_end_date date,
  version integer, occurrence_date date, lesson_type_id uuid, duration_minutes integer,
  requires_attention boolean, attention_reason public.attention_reason,
  cancel_source public.cancel_source, cancel_reason text, cancelled_at timestamptz,
  series_status public.series_status, pending_change_request_id uuid,
  pending_change_request_kind public.lesson_change_kind,
  attendance_status public.attendance_status, attendance_note text, attendance_version integer,
  attendance_updated_by_name text, attendance_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select l.id, l.series_id, l.start_at, l.end_at, l.status, l.location, l.outside_hours,
         l.student_id, s.full_name, l.teacher_id, t.full_name,
         coalesce(ss.regular_teacher_id is distinct from l.teacher_id, false), lt.name, lt.color,
         ls.day_of_week, ls.start_time, ls.end_date,
         l.version, l.occurrence_date, l.lesson_type_id,
         (extract(epoch from (l.end_at - l.start_at)) / 60)::integer,
         l.requires_attention, case when v_role = 'teacher' then null else l.attention_reason end,
         l.cancel_source, l.cancel_reason, l.cancelled_at, ls.status,
         cr.id, cr.kind,
         a.status, a.note, a.version, up.full_name, a.updated_at
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.student_subjects ss on ss.student_id = l.student_id and ss.lesson_type_id = l.lesson_type_id
  left join public.lesson_series ls on ls.id = l.series_id
  left join public.lesson_change_requests cr on cr.lesson_id = l.id and cr.status = 'pending'
  left join public.attendance a on a.lesson_id = l.id
  left join public.profiles up on up.id = a.updated_by
  where l.id = p_id
    and (v_role <> 'teacher' or l.teacher_id = public.current_teacher_id());
end;
$$;

-- A person's lessons in a range, with attendance. An admin may filter by student and/or teacher; a
-- teacher always sees only their own lessons. Cancelled lessons are included (marked by status).
create function public.list_history_lessons(
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
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
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
  order by l.start_at desc
  limit 500;
end;
$$;

-- Scheduled lessons that ended in the last 30 days and have no attendance report. An admin sees all
-- of them; an active teacher only their own. "total" is the full count (the list is capped).
create function public.list_unreported_lessons(p_limit integer)
returns table (
  id uuid, start_at timestamptz, end_at timestamptz, student_name text, teacher_name text,
  lesson_type_name text, color text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_teacher uuid;
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null or not exists (select 1 from public.teachers tt where tt.id = v_teacher and tt.status = 'active') then
      return;
    end if;
  end if;

  return query
  select l.id, l.start_at, l.end_at, s.full_name, t.full_name, lt.name, lt.color, count(*) over ()
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where l.status = 'scheduled'
    and l.end_at <= now() and l.end_at > now() - interval '30 days'
    and (v_teacher is null or l.teacher_id = v_teacher)
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
  order by l.start_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

-- Dashboard totals for a range. Only lessons that are still scheduled count, so a lesson cancelled
-- after it was marked "held" is never counted as held.
create function public.attendance_summary(p_from timestamptz, p_to timestamptz, p_teacher_id uuid)
returns table (held bigint, student_absent bigint, teacher_absent bigint, unreported bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select count(*) filter (where a.status = 'held'),
         count(*) filter (where a.status = 'student_absent'),
         count(*) filter (where a.status = 'teacher_absent'),
         count(*) filter (where a.lesson_id is null and l.end_at <= now())
  from public.lessons l
  left join public.attendance a on a.lesson_id = l.id
  where l.status = 'scheduled'
    and l.start_at >= p_from and l.start_at < p_to
    and (p_teacher_id is null or l.teacher_id = p_teacher_id);
end;
$$;

-- The admin activity log. p_kind: 'attendance' (reports and corrections), 'changes' (lesson and
-- series changes, cancellations, restores) or null/anything else for everything. 50 per page.
create function public.list_audit_events(p_from timestamptz, p_to timestamptz, p_kind text, p_offset integer)
returns table (
  id uuid, created_at timestamptz, action text, entity text, entity_id uuid, actor_name text,
  student_name text, teacher_name text, lesson_start_at timestamptz, old_values jsonb, new_values jsonb,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select e.id, e.created_at, e.action, e.entity, e.entity_id, a.full_name,
         s.full_name, t.full_name, l.start_at, e.old_values, e.new_values, count(*) over ()
  from public.audit_events e
  left join public.profiles a on a.id = e.actor_id
  left join public.lessons l on e.entity = 'lesson' and l.id = e.entity_id
  left join public.lesson_series sr on e.entity = 'series' and sr.id = e.entity_id
  left join public.students s on s.id = coalesce(l.student_id, sr.student_id)
  left join public.teachers t on t.id = coalesce(l.teacher_id, sr.teacher_id)
  where e.created_at >= p_from and e.created_at < p_to
    and (
      case p_kind
        when 'attendance' then e.action in
          ('attendance_reported', 'attendance_changed', 'attendance_cleared', 'held_lesson_cancelled')
        when 'changes' then e.action not in ('attendance_reported', 'attendance_changed', 'attendance_cleared')
        else true
      end)
  order by e.created_at desc
  limit 50 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- The home-page card of recent changes also shows lessons cancelled after being marked "held".
create or replace function public.list_recent_changes(p_limit integer)
returns table (
  id uuid, created_at timestamptz, action text, entity text, entity_id uuid, actor_name text,
  student_name text, teacher_name text, lesson_start_at timestamptz, old_values jsonb, new_values jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select e.id, e.created_at, e.action, e.entity, e.entity_id, a.full_name,
         s.full_name, t.full_name, l.start_at, e.old_values, e.new_values
  from public.audit_events e
  left join public.profiles a on a.id = e.actor_id
  left join public.lessons l on e.entity = 'lesson' and l.id = e.entity_id
  left join public.students s on s.id = l.student_id
  left join public.teachers t on t.id = l.teacher_id
  where e.action in (
    'lesson_cancelled', 'lesson_restored', 'lesson_updated', 'lesson_change_requested', 'lesson_restore_requested',
    'teacher_restore_outside_hours', 'series_changed', 'series_stopped', 'series_extended', 'series_resumed',
    'series_change_requested', 'closure_cancelled', 'change_requested', 'change_request_approved',
    'change_request_rejected', 'duration_changed', 'student_deactivated', 'teacher_deactivated',
    'held_lesson_cancelled')
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

revoke execute on function
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean, boolean),
  public.get_lesson(uuid),
  public.list_history_lessons(uuid, uuid, timestamptz, timestamptz),
  public.list_unreported_lessons(integer),
  public.attendance_summary(timestamptz, timestamptz, uuid),
  public.list_audit_events(timestamptz, timestamptz, text, integer)
from public, anon, authenticated;

grant execute on function
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean, boolean),
  public.get_lesson(uuid),
  public.list_history_lessons(uuid, uuid, timestamptz, timestamptz),
  public.list_unreported_lessons(integer),
  public.attendance_summary(timestamptz, timestamptz, uuid),
  public.list_audit_events(timestamptz, timestamptz, text, integer)
to authenticated;
