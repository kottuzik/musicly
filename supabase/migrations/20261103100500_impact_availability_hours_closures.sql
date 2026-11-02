-- Milestone 6, step 6a: what a teacher's absence or removed availability, new operating hours, and
-- a cancelled closure day do to lessons that already exist. Problem lessons are never moved
-- silently: they get a "needs attention" flag, or the admin decides per lesson. Decisions run in
-- one transaction: if one fails, nothing is saved, and the error names the lesson (detail).
-- Business errors: errcode P0001 + a stable key.

-- ---------------------------------------------------------------------------
-- Which lessons an availability request touches
-- ---------------------------------------------------------------------------

-- Future scheduled lessons of the teacher that the request takes out of their availability:
-- an absence (days, or hours on one day), a one-time slot removal, or a permanent slot removal
-- from its effective date on that weekday.
create function public.availability_impacted_lessons(p_request_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.availability_requests;
begin
  select * into r from public.availability_requests where id = p_request_id;
  if not found then
    return;
  end if;
  return query
  select l.id
  from public.lessons l
  where l.teacher_id = r.teacher_id and l.status = 'scheduled' and l.start_at > now()
    and (
      (r.kind = 'absence' and l.occurrence_date between r.start_date and r.end_date)
      or (r.kind = 'remove_once' and l.occurrence_date = r.start_date)
      or (r.kind = 'remove_weekly' and l.occurrence_date >= greatest(r.start_date, public.school_today())
          and extract(dow from l.occurrence_date)::smallint = r.day_of_week)
    )
    and (
      r.start_time is null
      or ((l.start_at at time zone 'Asia/Jerusalem')::time < r.end_time
          and (l.end_at at time zone 'Asia/Jerusalem')::time > r.start_time)
    )
  order by l.start_at;
end;
$$;

-- What the admin sees before deciding.
create function public.availability_request_impact(p_request_id uuid)
returns table (
  lesson_id uuid, start_at timestamptz, end_at timestamptz, student_name text,
  lesson_type_name text, color text, location public.lesson_location
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select l.id, l.start_at, l.end_at, s.full_name, lt.name, lt.color, l.location
  from public.availability_impacted_lessons(p_request_id) i
  join public.lessons l on l.id = i
  join public.students s on s.id = l.student_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  order by l.start_at;
end;
$$;

-- Flags the impacted lessons "needs attention" (the teacher is absent, or the slot is gone).
create function public.flag_availability_impact(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reason public.attention_reason;
begin
  select case when kind = 'remove_weekly' then 'availability_removed' else 'teacher_absent' end::public.attention_reason
  into v_reason from public.availability_requests where id = p_request_id;
  update public.lessons
  set requires_attention = true, attention_reason = v_reason
  where id in (select public.availability_impacted_lessons(p_request_id)) and attention_reason is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-lesson decision: a substitute teacher or another time
-- ---------------------------------------------------------------------------

-- Moves a lesson to p_teacher at p_date / p_start (its own duration and location). Returns
-- 'updated', or 'requested' when the time is outside that teacher's availability: they get an
-- approval request and the lesson stays flagged until they answer. Any problem raises
-- decision_failed with the lesson id as detail and the original key as hint.
create function public.apply_lesson_decision(
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
        );
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
-- An admin decides a teacher's availability request (replaces the M4 version)
-- ---------------------------------------------------------------------------

drop function public.decide_availability_request(uuid, integer, boolean, text);

-- p_decisions: [{"lesson_id", "action": "cancel" | "substitute" | "move" | "keep",
--   "teacher_id", "date", "start"}] for the lessons the approval affects. A lesson without a
-- decision is kept and flagged. Returns counts of what happened.
create function public.decide_availability_request(
  p_id uuid, p_version integer, p_approve boolean, p_note text, p_decisions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.availability_requests;
  v_reason public.attention_reason;
  v_impacted uuid[];
  d jsonb;
  v_id uuid;
  v_action text;
  v_out text;
  v_counts jsonb := jsonb_build_object('cancelled', 0, 'substituted', 0, 'moved', 0, 'requested', 0, 'kept', 0);
begin
  perform public.require_admin();

  update public.availability_requests
  set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
      decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id and status = 'pending' and version = p_version
  returning * into r;
  if not found then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;
  if not p_approve then
    return v_counts;
  end if;

  perform public.apply_availability_request(p_id);
  v_reason := case when r.kind = 'remove_weekly' then 'availability_removed' else 'teacher_absent' end;
  v_impacted := array(select public.availability_impacted_lessons(p_id));

  -- A decision about a lesson the request does not touch is a mistake in the call.
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    if not ((d ->> 'lesson_id')::uuid = any (v_impacted)) then
      raise exception 'decision_failed' using errcode = 'P0001', detail = d ->> 'lesson_id', hint = 'not_impacted';
    end if;
  end loop;

  foreach v_id in array v_impacted loop
    select e into d from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) e
    where (e ->> 'lesson_id')::uuid = v_id limit 1;
    v_action := coalesce(d ->> 'action', 'keep');

    if v_action = 'cancel' then
      perform public.do_cancel_lesson(v_id, 'admin', 'בעקבות היעדרות או הסרת זמינות של המורה');
      v_counts := jsonb_set(v_counts, '{cancelled}', to_jsonb((v_counts ->> 'cancelled')::integer + 1));
    elsif v_action in ('substitute', 'move') then
      if v_action = 'substitute' then
        select public.apply_lesson_decision(
          v_id, (d ->> 'teacher_id')::uuid,
          (l.start_at at time zone 'Asia/Jerusalem')::date, (l.start_at at time zone 'Asia/Jerusalem')::time, v_reason)
        into v_out from public.lessons l where l.id = v_id;
      else
        select public.apply_lesson_decision(
          v_id, l.teacher_id, (d ->> 'date')::date, (d ->> 'start')::time, v_reason)
        into v_out from public.lessons l where l.id = v_id;
      end if;
      v_counts := jsonb_set(v_counts, array[case when v_out = 'requested' then 'requested'
                                                 when v_action = 'substitute' then 'substituted' else 'moved' end],
        to_jsonb((v_counts ->> case when v_out = 'requested' then 'requested'
                                    when v_action = 'substitute' then 'substituted' else 'moved' end)::integer + 1));
    elsif v_action = 'keep' then
      update public.lessons set requires_attention = true, attention_reason = coalesce(attention_reason, v_reason)
      where id = v_id;
      v_counts := jsonb_set(v_counts, '{kept}', to_jsonb((v_counts ->> 'kept')::integer + 1));
    else
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  end loop;
  return v_counts;
end;
$$;

-- ---------------------------------------------------------------------------
-- Direct admin changes: the lessons they hit are flagged for attention
-- (replaces the M4 versions; same signatures)
-- ---------------------------------------------------------------------------

create or replace function public.remove_availability(
  p_availability_id uuid,
  p_kind public.availability_request_kind,
  p_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.teacher_availability;
  v_admin boolean := public.is_admin();
  v_id uuid;
begin
  select * into s from public.teacher_availability where id = p_availability_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_admin and s.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_kind = 'absence' or p_date is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_date < public.school_today() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;

  if p_kind = 'remove_weekly' then
    if exists (
      select 1 from public.availability_requests
      where availability_id = s.id and kind = 'remove_weekly' and status = 'pending'
    ) then
      raise exception 'removal_pending' using errcode = 'P0001';
    end if;
  else
    if extract(dow from p_date)::smallint <> s.day_of_week then
      raise exception 'date_not_matching_day' using errcode = 'P0001';
    end if;
    if p_date < s.valid_from or (s.valid_to is not null and p_date > s.valid_to) then
      raise exception 'slot_not_valid_on_date' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.availability_requests
      where availability_id = s.id and kind = 'remove_once' and start_date = p_date
        and status in ('pending', 'approved')
    ) then
      raise exception 'removal_pending' using errcode = 'P0001';
    end if;
  end if;

  insert into public.availability_requests (
    teacher_id, kind, availability_id, day_of_week, start_date, start_time, end_time, reason,
    status, requested_by, decided_by, decided_at
  )
  values (
    s.teacher_id, p_kind, s.id, s.day_of_week, p_date, s.start_time, s.end_time,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when v_admin then 'approved'::public.request_status else 'pending'::public.request_status end,
    (select auth.uid()),
    case when v_admin then (select auth.uid()) end,
    case when v_admin then now() end
  )
  returning id into v_id;

  if v_admin then
    perform public.apply_availability_request(v_id);
    perform public.flag_availability_impact(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.report_absence(
  p_teacher_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_end date := coalesce(p_end_date, p_start_date);
  v_id uuid;
begin
  if not v_admin and p_teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_start_date is null or v_end < p_start_date then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_start_date < public.school_today() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;
  if (p_start_time is null) <> (p_end_time is null)
     or (p_start_time is not null and (v_end <> p_start_date or p_end_time <= p_start_time)) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_start_time is not null and (not public.is_quarter_hour(p_start_time) or not public.is_quarter_hour(p_end_time)) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;

  insert into public.availability_requests (
    teacher_id, kind, start_date, end_date, start_time, end_time, reason,
    status, requested_by, decided_by, decided_at
  )
  values (
    p_teacher_id, 'absence', p_start_date, v_end, p_start_time, p_end_time,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when v_admin then 'approved'::public.request_status else 'pending'::public.request_status end,
    (select auth.uid()),
    case when v_admin then (select auth.uid()) end,
    case when v_admin then now() end
  )
  returning id into v_id;

  if v_admin then
    perform public.apply_availability_request(v_id);
    perform public.flag_availability_impact(v_id);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- New operating hours: lessons that no longer fit are flagged (same signature as M4)
-- ---------------------------------------------------------------------------

create or replace function public.set_operating_hours(p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outside integer;
begin
  perform public.require_admin();

  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  delete from public.operating_hours where true;
  begin
    insert into public.operating_hours (day_of_week, open_time, close_time, updated_by)
    select (d ->> 'day')::smallint, (d ->> 'open')::time, (d ->> 'close')::time, (select auth.uid())
    from jsonb_array_elements(p_days) d;
  exception
    when check_violation or unique_violation or not_null_violation or invalid_datetime_format
      or invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;

  -- Future lessons outside the new hours (and not placed there on purpose) need attention;
  -- lessons flagged earlier that fit again are cleared.
  update public.lessons l
  set requires_attention = true, attention_reason = 'outside_hours'
  where l.status = 'scheduled' and l.start_at > now() and not l.outside_hours and l.attention_reason is null
    and not public.within_operating_hours(
      extract(dow from l.occurrence_date)::smallint,
      (l.start_at at time zone 'Asia/Jerusalem')::time, (l.end_at at time zone 'Asia/Jerusalem')::time);
  update public.lessons l
  set requires_attention = false, attention_reason = null
  where l.attention_reason = 'outside_hours' and l.status = 'scheduled'
    and public.within_operating_hours(
      extract(dow from l.occurrence_date)::smallint,
      (l.start_at at time zone 'Asia/Jerusalem')::time, (l.end_at at time zone 'Asia/Jerusalem')::time);

  select count(*) into v_outside
  from public.teacher_availability a
  join public.teachers t on t.id = a.teacher_id and t.status = 'active'
  where (a.valid_to is null or a.valid_to >= public.school_today())
    and not public.within_operating_hours(a.day_of_week, a.start_time, a.end_time);

  return v_outside;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelling a closure day: the admin chooses which "not held" lessons come back
-- ---------------------------------------------------------------------------

-- Future "not held" lessons in the closure's range that no other active closure still covers.
create function public.closure_impact(p_id uuid)
returns table (
  lesson_id uuid, start_at timestamptz, end_at timestamptz, student_name text, teacher_name text,
  lesson_type_name text, free boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select l.id, l.start_at, l.end_at, s.full_name, t.full_name, lt.name,
         public.lesson_conflict_except(l.teacher_id, l.student_id, l.start_at, l.end_at, l.id) is null
  from public.school_closures c
  join public.lessons l on l.occurrence_date between c.start_date and c.end_date
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where c.id = p_id and l.status = 'closed_day' and l.start_at > now()
    and not exists (
      select 1 from public.school_closures o
      where o.status = 'active' and o.id <> c.id and l.occurrence_date between o.start_date and o.end_date)
  order by l.start_at;
end;
$$;

drop function public.cancel_closure(uuid);

-- p_restore: lessons to bring back (empty list = none). Left out (null) = every one that is
-- free. The rest are cancelled with the reason "closure cancelled, not restored". A chosen
-- lesson whose time was taken fails the whole call (decision_failed, detail = the lesson).
create function public.cancel_closure(p_id uuid, p_restore uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.school_closures;
  l record;
  v_restored integer := 0;
  v_cancelled integer := 0;
  v_old public.lessons;
  v_new public.lessons;
begin
  perform public.require_admin();
  select * into c from public.school_closures where id = p_id and status = 'active' for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  update public.school_closures
  set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now()
  where id = c.id;

  for l in select * from public.closure_impact(p_id) loop
    if (p_restore is null and l.free) or l.lesson_id = any (coalesce(p_restore, '{}')) then
      if not l.free then
        raise exception 'decision_failed' using errcode = 'P0001', detail = l.lesson_id::text, hint = 'slot_taken';
      end if;
      select * into v_old from public.lessons where id = l.lesson_id for update;
      begin
        update public.lessons set status = 'scheduled' where id = l.lesson_id returning * into v_new;
      exception when exclusion_violation then
        raise exception 'decision_failed' using errcode = 'P0001', detail = l.lesson_id::text, hint = 'slot_taken';
      end;
      perform public.log_event('lesson', l.lesson_id, 'lesson_restored', public.lesson_snapshot(v_old), public.lesson_snapshot(v_new));
      v_restored := v_restored + 1;
    else
      perform public.do_cancel_lesson(l.lesson_id, 'closure_removed', 'יום הסגירה בוטל — השיעור לא שוחזר');
      v_cancelled := v_cancelled + 1;
    end if;
  end loop;

  perform public.log_event('closure', c.id, 'closure_cancelled', null,
    jsonb_build_object('restored', v_restored, 'cancelled', v_cancelled));
  return jsonb_build_object('restored', v_restored, 'cancelled', v_cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.availability_impacted_lessons(uuid),
  public.availability_request_impact(uuid),
  public.flag_availability_impact(uuid),
  public.apply_lesson_decision(uuid, uuid, date, time, public.attention_reason),
  public.decide_availability_request(uuid, integer, boolean, text, jsonb),
  public.closure_impact(uuid),
  public.cancel_closure(uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  public.availability_request_impact(uuid),
  public.decide_availability_request(uuid, integer, boolean, text, jsonb),
  public.closure_impact(uuid),
  public.cancel_closure(uuid, uuid[])
to authenticated;
