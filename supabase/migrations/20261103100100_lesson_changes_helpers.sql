-- Milestone 6, step 2: internal helpers shared by the change, cancel, restore and series functions.
-- None of these is callable from the app (no grant); the action functions in later migrations call them.

-- Audit log entry written by the current user. Callers pass ids and plain values only, never names
-- or contact details.
create function public.log_event(
  p_entity text, p_entity_id uuid, p_action text, p_old jsonb, p_new jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (actor_id, entity, entity_id, action, old_values, new_values)
  values ((select auth.uid()), p_entity, p_entity_id, p_action, p_old, p_new);
$$;

-- The values of a lesson worth keeping in the audit log.
create function public.lesson_snapshot(p_lesson public.lessons)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'start_at', p_lesson.start_at, 'end_at', p_lesson.end_at, 'teacher_id', p_lesson.teacher_id,
    'location', p_lesson.location, 'status', p_lesson.status,
    'attention_reason', p_lesson.attention_reason
  );
$$;

-- Like lesson_conflict, but a lesson never conflicts with itself (moving a lesson to an
-- overlapping time of its own is allowed).
create function public.lesson_conflict_except(
  p_teacher uuid, p_student uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.lessons
      where teacher_id = p_teacher and status = 'scheduled' and id is distinct from p_exclude
        and start_at < p_end and end_at > p_start
    ) then 'teacher_busy'
    when exists (
      select 1 from public.lessons
      where student_id = p_student and status = 'scheduled' and id is distinct from p_exclude
        and start_at < p_end and end_at > p_start
    ) then 'student_busy'
  end;
$$;

-- Why a lesson cannot take this slot, or null when it can: 'closed_day', 'teacher_busy',
-- 'student_busy' or (when asked) 'teacher_unavailable'. p_exclude is the lesson being moved.
create function public.slot_problem(
  p_teacher uuid, p_student uuid, p_date date, p_start time, p_duration integer,
  p_exclude uuid, p_check_availability boolean
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := public.local_ts(p_date, p_start);
  v_end timestamptz := v_start + make_interval(mins => p_duration);
begin
  if public.closure_on(p_date) then
    return 'closed_day';
  end if;
  return coalesce(
    public.lesson_conflict_except(p_teacher, p_student, v_start, v_end, p_exclude),
    case when p_check_availability
              and not public.teacher_covers(p_teacher, p_date, p_start, p_start + make_interval(mins => p_duration), true)
         then 'teacher_unavailable' end
  );
end;
$$;

-- Up to six free start times on one day, in quarter-hour steps, inside the school's hours and the
-- teacher's availability. Used when a requested time is taken (restore, duration change).
create function public.suggest_slots(
  p_teacher uuid, p_student uuid, p_date date, p_duration integer, p_exclude uuid
)
returns table (start_time time)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_open time;
  v_close time;
  v_candidate time;
  v_found integer := 0;
begin
  select open_time, close_time into v_open, v_close
  from public.operating_hours where day_of_week = extract(dow from p_date)::smallint;
  if not found or public.closure_on(p_date) then
    return;
  end if;

  v_candidate := v_open;
  while v_found < 6 and v_candidate + make_interval(mins => p_duration) <= v_close loop
    if public.local_ts(p_date, v_candidate) > now()
       and public.slot_problem(p_teacher, p_student, p_date, v_candidate, p_duration, p_exclude, true) is null then
      start_time := v_candidate;
      v_found := v_found + 1;
      return next;
    end if;
    v_candidate := v_candidate + interval '15 minutes';
    exit when v_candidate < v_open;  -- wrapped past midnight
  end loop;
end;
$$;

-- Cancels a lesson: records who, when, why and through which path, clears any attention flag,
-- closes a pending teacher request for it and writes the audit entry.
create function public.do_cancel_lesson(p_lesson_id uuid, p_source public.cancel_source, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if l.status = 'cancelled' then
    raise exception 'lesson_already_cancelled' using errcode = 'P0001';
  end if;

  update public.lessons
  set status = 'cancelled', requires_attention = false, attention_reason = null,
      cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_source = p_source,
      cancel_reason = nullif(trim(p_reason), '')
  where id = l.id;

  update public.lesson_change_requests
  set status = 'cancelled', decided_at = now(), decision_note = 'השיעור בוטל'
  where lesson_id = l.id and status = 'pending';

  perform public.log_event('lesson', l.id, 'lesson_cancelled', public.lesson_snapshot(l),
    jsonb_build_object('source', p_source, 'reason', nullif(trim(p_reason), '')));
end;
$$;

-- Moves or edits one lesson (time, duration, teacher, location). Clears the attention flag, since
-- an explicit change resolves it, and logs old and new values. A concurrent booking that slips in
-- is reported as teacher_busy / student_busy; a series date already used as date_taken.
create function public.do_update_lesson(
  p_lesson_id uuid, p_teacher uuid, p_date date, p_start time, p_duration integer,
  p_location public.lesson_location, p_outside_hours boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_start timestamptz := public.local_ts(p_date, p_start);
  v_constraint text;
  v_new public.lessons;
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  begin
    update public.lessons
    set teacher_id = p_teacher, occurrence_date = p_date, start_at = v_start,
        end_at = v_start + make_interval(mins => p_duration), location = p_location,
        outside_hours = p_outside_hours, requires_attention = false, attention_reason = null
    where id = l.id
    returning * into v_new;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', public.overlap_error(v_constraint) using errcode = 'P0001';
    when unique_violation then
      raise exception 'date_taken' using errcode = 'P0001';
  end;

  perform public.log_event('lesson', l.id, 'lesson_updated', public.lesson_snapshot(l), public.lesson_snapshot(v_new));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: internal only
-- ---------------------------------------------------------------------------

revoke execute on function
  public.log_event(text, uuid, text, jsonb, jsonb),
  public.lesson_snapshot(public.lessons),
  public.lesson_conflict_except(uuid, uuid, timestamptz, timestamptz, uuid),
  public.slot_problem(uuid, uuid, date, time, integer, uuid, boolean),
  public.suggest_slots(uuid, uuid, date, integer, uuid),
  public.do_cancel_lesson(uuid, public.cancel_source, text),
  public.do_update_lesson(uuid, uuid, date, time, integer, public.lesson_location, boolean)
from public, anon, authenticated;
