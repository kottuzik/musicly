-- Milestone 6, step 6b: what a changed subject duration, a deactivated student or teacher do to
-- existing lessons, plus the reads the new screens need (attention list, recent changes, lesson
-- history, richer lesson details). Business errors: errcode P0001 + a stable key.

-- ---------------------------------------------------------------------------
-- Subject duration
-- ---------------------------------------------------------------------------

-- Per active series of the subject with upcoming lessons: which meetings would clash (or run past
-- the school's hours) at the new duration, with other times that day to offer.
create function public.lesson_type_duration_impact(p_id uuid, p_new_duration integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  s record;
  l record;
  v_conflicts jsonb;
  v_meetings integer;
begin
  perform public.require_admin();
  if p_new_duration is null or p_new_duration not between 5 and 240 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  for s in
    select ls.id, ls.teacher_id, ls.student_id, ls.day_of_week, ls.start_time, ls.duration_minutes,
           st.full_name as student_name, t.full_name as teacher_name
    from public.lesson_series ls
    join public.students st on st.id = ls.student_id
    join public.teachers t on t.id = ls.teacher_id
    where ls.lesson_type_id = p_id and ls.status = 'active'
      and exists (select 1 from public.lessons x where x.series_id = ls.id and x.status = 'scheduled' and x.start_at > now())
    order by st.full_name, ls.day_of_week, ls.start_time
  loop
    v_conflicts := '[]'::jsonb;
    v_meetings := 0;
    for l in
      select x.id, x.occurrence_date, x.start_at, x.outside_hours
      from public.lessons x
      where x.series_id = s.id and x.status = 'scheduled' and x.start_at > now()
      order by x.occurrence_date
    loop
      v_meetings := v_meetings + 1;
      if public.lesson_conflict_except(s.teacher_id, s.student_id, l.start_at, l.start_at + make_interval(mins => p_new_duration), l.id) is not null
         or (not l.outside_hours and not public.within_operating_hours(
              extract(dow from l.occurrence_date)::smallint,
              (l.start_at at time zone 'Asia/Jerusalem')::time,
              (l.start_at at time zone 'Asia/Jerusalem')::time + make_interval(mins => p_new_duration))) then
        v_conflicts := v_conflicts || jsonb_build_object(
          'lesson_id', l.id, 'date', l.occurrence_date,
          'start', to_char((l.start_at at time zone 'Asia/Jerusalem')::time, 'HH24:MI'),
          'suggestions', (
            select coalesce(jsonb_agg(to_char(g.start_time, 'HH24:MI')), '[]'::jsonb)
            from public.suggest_slots(s.teacher_id, s.student_id, l.occurrence_date, p_new_duration, l.id) g));
      end if;
    end loop;
    v_result := v_result || jsonb_build_object(
      'series_id', s.id, 'student_name', s.student_name, 'teacher_name', s.teacher_name,
      'day', s.day_of_week, 'start', to_char(s.start_time, 'HH24:MI'), 'current_duration', s.duration_minutes,
      'meetings', v_meetings, 'conflicts', v_conflicts);
  end loop;
  return v_result;
end;
$$;

-- Sets the subject's default duration (for new bookings) and, for the chosen series, the new
-- duration of their upcoming meetings. p_series: [{"series_id", "alternatives": [{"lesson_id",
-- "start": "HH:MM" | null}]}]. A clashing meeting moves to its chosen start; without one it keeps
-- its old duration. Past lessons and single lessons never change.
create function public.apply_lesson_type_duration(p_id uuid, p_new_duration integer, p_series jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer;
  e jsonb;
  alt jsonb;
  s public.lesson_series;
  l record;
  v_updated integer := 0;
  v_moved integer := 0;
  v_kept integer := 0;
  v_start time;
  v_clash boolean;
begin
  perform public.require_admin();
  if p_new_duration is null or p_new_duration not between 5 and 240 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  select default_duration_minutes into v_old from public.lesson_types where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.lesson_types set default_duration_minutes = p_new_duration where id = p_id;

  for e in select * from jsonb_array_elements(coalesce(p_series, '[]'::jsonb)) loop
    select * into s from public.lesson_series where id = (e ->> 'series_id')::uuid and lesson_type_id = p_id for update;
    if not found or s.status <> 'active' then
      raise exception 'decision_failed' using errcode = 'P0001', detail = e ->> 'series_id', hint = 'series_not_active';
    end if;
    update public.lesson_series set duration_minutes = p_new_duration where id = s.id;

    for l in
      select x.id, x.occurrence_date, x.start_at, x.teacher_id, x.student_id, x.location, x.outside_hours
      from public.lessons x
      where x.series_id = s.id and x.status = 'scheduled' and x.start_at > now()
      order by x.occurrence_date
    loop
      v_clash := public.lesson_conflict_except(l.teacher_id, l.student_id, l.start_at, l.start_at + make_interval(mins => p_new_duration), l.id) is not null
        or (not l.outside_hours and not public.within_operating_hours(
              extract(dow from l.occurrence_date)::smallint,
              (l.start_at at time zone 'Asia/Jerusalem')::time,
              (l.start_at at time zone 'Asia/Jerusalem')::time + make_interval(mins => p_new_duration)));
      if not v_clash then
        update public.lessons set end_at = start_at + make_interval(mins => p_new_duration) where id = l.id;
        v_updated := v_updated + 1;
        continue;
      end if;

      select a into alt from jsonb_array_elements(coalesce(e -> 'alternatives', '[]'::jsonb)) a
      where (a ->> 'lesson_id')::uuid = l.id limit 1;
      v_start := nullif(alt ->> 'start', '')::time;
      if v_start is null then
        v_kept := v_kept + 1;
        continue;
      end if;
      if public.local_ts(l.occurrence_date, v_start) <= now()
         or public.slot_problem(l.teacher_id, l.student_id, l.occurrence_date, v_start, p_new_duration, l.id, true) is not null
         or not public.within_operating_hours(extract(dow from l.occurrence_date)::smallint, v_start, v_start + make_interval(mins => p_new_duration)) then
        raise exception 'decision_failed' using errcode = 'P0001', detail = l.id::text, hint = 'slot_taken';
      end if;
      perform public.do_update_lesson(l.id, l.teacher_id, l.occurrence_date, v_start, p_new_duration, l.location, false);
      v_moved := v_moved + 1;
    end loop;
  end loop;

  perform public.log_event('lesson_type', p_id, 'duration_changed',
    jsonb_build_object('minutes', v_old),
    jsonb_build_object('minutes', p_new_duration, 'updated', v_updated, 'moved', v_moved, 'kept', v_kept));
  return jsonb_build_object('updated', v_updated, 'moved', v_moved, 'kept', v_kept);
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivating a student
-- ---------------------------------------------------------------------------

-- What deactivating would do: upcoming lessons and active series to cancel, pending requests to close.
create function public.student_status_impact(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'lessons', (select count(*) from public.lessons
                where student_id = p_id and status in ('scheduled', 'closed_day') and start_at > now()),
    'series', (select count(*) from public.lesson_series where student_id = p_id and status = 'active'),
    'requests', (select count(*) from public.exception_booking_requests where student_id = p_id and status = 'pending')
  );
end;
$$;

-- Same signature as M3. Deactivating also cancels every upcoming lesson, ends the series and
-- closes pending booking requests; none of it comes back when the student is reactivated.
create or replace function public.set_student_status(
  p_id uuid,
  p_status public.user_status,
  p_return_date date,
  p_return_mode public.student_return_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_lessons integer := 0;
begin
  perform public.require_admin();

  if p_status = 'active' then
    update public.students
    set status = 'active', expected_return_date = null, return_mode = null
    where id = p_id;
  else
    if p_return_date is null and p_return_mode is not null then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    if p_return_date is not null then
      if p_return_date <= public.school_today() then
        raise exception 'return_date_past' using errcode = 'P0001';
      end if;
      if p_return_mode is null then
        raise exception 'return_mode_required' using errcode = 'P0001';
      end if;
    end if;
    update public.students
    set status = 'inactive', expected_return_date = p_return_date, return_mode = p_return_mode
    where id = p_id;
  end if;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_status = 'inactive' then
    for l in
      select id from public.lessons
      where student_id = p_id and status in ('scheduled', 'closed_day') and start_at > now()
      order by start_at
    loop
      perform public.do_cancel_lesson(l.id, 'student_inactive', null);
      v_lessons := v_lessons + 1;
    end loop;
    update public.lesson_series
    set status = 'ended', end_date = greatest(start_date, least(coalesce(end_date, public.school_today()), public.school_today()))
    where student_id = p_id and status = 'active';
    update public.exception_booking_requests
    set status = 'cancelled', result_note = 'התלמיד הושבת'
    where student_id = p_id and status = 'pending';
    perform public.log_event('student', p_id, 'student_deactivated', null, jsonb_build_object('cancelled_lessons', v_lessons));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivating a teacher
-- ---------------------------------------------------------------------------

create function public.teacher_status_impact(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'lessons', (select count(*) from public.lessons where teacher_id = p_id and status = 'scheduled' and start_at > now()),
    'requests', (select count(*) from public.exception_booking_requests where teacher_id = p_id and status = 'pending')
                + (select count(*) from public.lesson_change_requests where teacher_id = p_id and status = 'pending')
  );
end;
$$;

-- Same signature as M2. Deactivating keeps the teacher's upcoming lessons in place, flagged for
-- attention, and closes their pending booking and change requests.
create or replace function public.set_teacher_status(p_teacher_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_flagged integer;
begin
  perform public.require_admin();

  update public.teachers set status = p_status where id = p_teacher_id
  returning profile_id into v_profile;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

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
end;
$$;

-- Occurrences generated for an inactive teacher's series are flagged too (same as M5 otherwise).
create or replace function public.generate_series_occurrences(p_series_id uuid, p_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  p record;
  v_skipped jsonb := '[]'::jsonb;
  v_constraint text;
  v_inactive boolean;
begin
  select * into s from public.lesson_series where id = p_series_id for update;
  if not found or p_until <= s.generated_until then
    return v_skipped;
  end if;
  v_inactive := exists (select 1 from public.teachers where id = s.teacher_id and status = 'inactive');

  for p in
    select * from public.series_plan(
      s.teacher_id, s.student_id, s.day_of_week, s.start_time, s.duration_minutes,
      greatest(s.start_date, s.generated_until + 1), least(p_until, coalesce(s.end_date, p_until)),
      s.exception_request_id is null)
  loop
    if p.outcome in ('scheduled', 'closed_day') then
      begin
        insert into public.lessons (
          series_id, occurrence_date, student_id, lesson_type_id, teacher_id, start_at, end_at,
          location, status, outside_hours, exception_request_id, created_by,
          requires_attention, attention_reason
        )
        values (
          s.id, p.occurrence_date, s.student_id, s.lesson_type_id, s.teacher_id, p.start_at, p.end_at,
          s.location, p.outcome::public.lesson_status, s.outside_hours, s.exception_request_id, s.created_by,
          v_inactive and p.outcome = 'scheduled',
          case when v_inactive and p.outcome = 'scheduled' then 'teacher_inactive'::public.attention_reason end
        )
        on conflict (series_id, occurrence_date) do nothing;
      exception when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        v_skipped := v_skipped || jsonb_build_object('date', p.occurrence_date, 'reason', public.overlap_error(v_constraint));
      end;
    elsif p.outcome <> 'past' then
      v_skipped := v_skipped || jsonb_build_object('date', p.occurrence_date, 'reason', p.outcome);
    end if;
  end loop;

  update public.lesson_series set generated_until = p_until where id = s.id;
  return v_skipped;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

drop function public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean);

-- p_attention_only: admins' "needs attention" filter. The reason is shown to admins only.
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
  attention_reason public.attention_reason
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
         case when v_role = 'teacher' then null else l.attention_reason end
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
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
  pending_change_request_kind public.lesson_change_kind
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
         cr.id, cr.kind
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.student_subjects ss on ss.student_id = l.student_id and ss.lesson_type_id = l.lesson_type_id
  left join public.lesson_series ls on ls.id = l.series_id
  left join public.lesson_change_requests cr on cr.lesson_id = l.id and cr.status = 'pending'
  where l.id = p_id
    and (v_role <> 'teacher' or l.teacher_id = public.current_teacher_id());
end;
$$;

-- Upcoming lessons flagged "needs attention".
create function public.list_attention_lessons()
returns table (
  id uuid, version integer, start_at timestamptz, end_at timestamptz, series_id uuid,
  attention_reason public.attention_reason, student_name text, teacher_name text,
  lesson_type_name text, color text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select l.id, l.version, l.start_at, l.end_at, l.series_id, l.attention_reason, s.full_name, t.full_name, lt.name, lt.color
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where l.requires_attention and l.status = 'scheduled' and l.start_at > now()
  order by l.start_at
  limit 200;
end;
$$;

-- Latest logged changes with names looked up now (the log itself holds no names).
create function public.list_recent_changes(p_limit integer)
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
    'change_request_rejected', 'duration_changed', 'student_deactivated', 'teacher_deactivated')
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

create function public.list_lesson_history(p_lesson_id uuid)
returns table (id uuid, created_at timestamptz, action text, actor_name text, old_values jsonb, new_values jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select e.id, e.created_at, e.action, a.full_name, e.old_values, e.new_values
  from public.audit_events e
  left join public.profiles a on a.id = e.actor_id
  where e.entity = 'lesson' and e.entity_id = p_lesson_id
  order by e.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.lesson_type_duration_impact(uuid, integer),
  public.apply_lesson_type_duration(uuid, integer, jsonb),
  public.student_status_impact(uuid),
  public.teacher_status_impact(uuid),
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean, boolean),
  public.get_lesson(uuid),
  public.list_attention_lessons(),
  public.list_recent_changes(integer),
  public.list_lesson_history(uuid)
from public, anon, authenticated;

grant execute on function
  public.lesson_type_duration_impact(uuid, integer),
  public.apply_lesson_type_duration(uuid, integer, jsonb),
  public.student_status_impact(uuid),
  public.teacher_status_impact(uuid),
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean, boolean),
  public.get_lesson(uuid),
  public.list_attention_lessons(),
  public.list_recent_changes(integer),
  public.list_lesson_history(uuid)
to authenticated;
