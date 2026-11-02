-- Milestone 7 follow-up: an admin who changes (or restores, or changes the series of) a lesson whose
-- earlier request to the teacher has not been answered no longer gets "change_request_pending".
-- The earlier request is deleted and the new one takes its place (the deletion is logged).

create function public.discard_pending_requests(p_lesson_id uuid, p_series_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.exception_booking_requests
    where status = 'pending'
      and ((p_lesson_id is not null and target_lesson_id = p_lesson_id)
        or (p_series_id is not null and target_series_id = p_series_id))
    returning id
  )
  select count(*) into v_count from gone;
  if v_count > 0 then
    perform public.log_event(
      case when p_lesson_id is not null then 'lesson' else 'series' end,
      coalesce(p_lesson_id, p_series_id), 'change_request_replaced', null,
      jsonb_build_object('replaced', v_count));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.discard_pending_requests(uuid, uuid) from public, anon, authenticated;

create or replace function public.update_lesson(
  p_id uuid,
  p_version integer,
  p_date date,
  p_start time,
  p_duration integer,
  p_teacher_id uuid,
  p_location public.lesson_location,
  p_confirm_outside_hours boolean,
  p_change_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_start timestamptz;
  v_end_time time;
  v_outside boolean;
  v_conflict text;
  v_id uuid;
begin
  perform public.require_admin();
  select * into l from public.lessons where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if l.version <> p_version then
    raise exception 'lesson_changed' using errcode = 'P0001';
  end if;
  if l.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled' using errcode = 'P0001';
  end if;
  if l.start_at <= now() then
    raise exception 'lesson_past' using errcode = 'P0001';
  end if;
  if p_date is null or p_location is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  perform public.check_booking(l.student_id, l.lesson_type_id, p_teacher_id, p_start, p_duration, false);
  v_start := public.local_ts(p_date, p_start);
  v_end_time := p_start + make_interval(mins => p_duration);
  if v_start <= now() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;
  if public.closure_on(p_date) then
    raise exception 'closed_day' using errcode = 'P0001';
  end if;
  v_conflict := public.lesson_conflict_except(
    p_teacher_id, l.student_id, v_start, v_start + make_interval(mins => p_duration), l.id);
  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = 'P0001';
  end if;
  v_outside := not public.within_operating_hours(extract(dow from p_date)::smallint, p_start, v_end_time);
  if v_outside and not coalesce(p_confirm_outside_hours, false) then
    raise exception 'outside_hours_confirm_required' using errcode = 'P0001';
  end if;
  -- A new request replaces an earlier one to the teacher that is still waiting for an answer.
  perform public.discard_pending_requests(l.id, null);

  if p_change_request_id is not null then
    update public.lesson_change_requests
    set status = 'approved', decided_by = (select auth.uid()), decided_at = now()
    where id = p_change_request_id and lesson_id = l.id and status = 'pending';
    if not found then
      raise exception 'request_already_handled' using errcode = 'P0001';
    end if;
  end if;

  if not public.teacher_covers(p_teacher_id, p_date, p_start, v_end_time, true) then
    insert into public.exception_booking_requests (
      kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time,
      duration_minutes, first_start_at, outside_hours, requested_by, target_lesson_id
    )
    values (
      'lesson_change', l.student_id, l.lesson_type_id, p_teacher_id, p_location, p_date, p_start,
      p_duration, v_start, v_outside, (select auth.uid()), l.id
    )
    returning id into v_id;
    perform public.log_event('lesson', l.id, 'lesson_change_requested', public.lesson_snapshot(l),
      jsonb_build_object('start_at', v_start, 'teacher_id', p_teacher_id, 'request_id', v_id));
    return jsonb_build_object('result', 'request', 'id', v_id);
  end if;

  perform public.do_update_lesson(l.id, p_teacher_id, p_date, p_start, p_duration, p_location, v_outside);
  return jsonb_build_object('result', 'lesson', 'id', l.id);
end;
$$;

create or replace function public.restore_lesson(
  p_id uuid, p_version integer, p_date date, p_start time, p_confirm_outside_hours boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_admin boolean := public.is_admin();
  v_date date;
  v_start time;
  v_end_time time;
  v_duration integer;
  v_start_at timestamptz;
  v_outside boolean;
  v_id uuid;
begin
  select * into l from public.lessons where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_admin and not (
    l.teacher_id is not distinct from public.current_teacher_id()
    and exists (select 1 from public.teachers where id = l.teacher_id and status = 'active')
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if l.version <> p_version then
    raise exception 'lesson_changed' using errcode = 'P0001';
  end if;
  if l.status <> 'cancelled' then
    raise exception 'lesson_not_cancelled' using errcode = 'P0001';
  end if;
  if (p_date is null) <> (p_start is null) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  v_date := coalesce(p_date, l.occurrence_date);
  v_start := coalesce(p_start, (l.start_at at time zone 'Asia/Jerusalem')::time);
  v_duration := (extract(epoch from (l.end_at - l.start_at)) / 60)::integer;
  v_end_time := v_start + make_interval(mins => v_duration);
  v_start_at := public.local_ts(v_date, v_start);

  perform public.check_booking(l.student_id, l.lesson_type_id, l.teacher_id, v_start, v_duration, false);
  if p_date is not null and v_start_at <= now() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;
  if public.closure_on(v_date) then
    raise exception 'closed_day' using errcode = 'P0001';
  end if;
  if public.lesson_conflict_except(l.teacher_id, l.student_id, v_start_at, v_start_at + (l.end_at - l.start_at), l.id) is not null then
    return jsonb_build_object(
      'result', 'slot_taken',
      'suggestions', (
        select coalesce(jsonb_agg(to_char(s.start_time, 'HH24:MI')), '[]'::jsonb)
        from public.suggest_slots(l.teacher_id, l.student_id, v_date, v_duration, l.id) s
      )
    );
  end if;

  v_outside := not public.within_operating_hours(extract(dow from v_date)::smallint, v_start, v_end_time);
  if v_outside and not coalesce(p_confirm_outside_hours, false) then
    raise exception 'outside_hours_confirm_required' using errcode = 'P0001';
  end if;

  if v_admin and v_start_at > now()
     and not public.teacher_covers(l.teacher_id, v_date, v_start, v_end_time, true) then
    -- A new request replaces an earlier one to the teacher that is still waiting for an answer.
    perform public.discard_pending_requests(l.id, null);
    insert into public.exception_booking_requests (
      kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time,
      duration_minutes, first_start_at, outside_hours, requested_by, target_lesson_id
    )
    values (
      'restore', l.student_id, l.lesson_type_id, l.teacher_id, l.location, v_date, v_start,
      v_duration, v_start_at, v_outside, (select auth.uid()), l.id
    )
    returning id into v_id;
    perform public.log_event('lesson', l.id, 'lesson_restore_requested', public.lesson_snapshot(l),
      jsonb_build_object('start_at', v_start_at, 'request_id', v_id));
    return jsonb_build_object('result', 'request', 'id', v_id);
  end if;

  perform public.do_restore_lesson(l.id, v_date, v_start, v_outside);
  if not v_admin and v_outside then
    perform public.log_event('lesson', l.id, 'teacher_restore_outside_hours', null,
      jsonb_build_object('start_at', v_start_at));
  end if;
  return jsonb_build_object('result', 'lesson', 'id', l.id);
end;
$$;

create or replace function public.change_series(
  p_series_id uuid, p_from_date date, p_day smallint, p_start time, p_duration integer,
  p_teacher_id uuid, p_location public.lesson_location, p_confirm_outside_hours boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  v_preview jsonb;
  v_id uuid;
  v_first date;
  v_first_start timestamptz;
begin
  perform public.require_admin();
  if p_location is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  v_preview := public.preview_series_change(p_series_id, p_from_date, p_day, p_start, p_duration, p_teacher_id, p_location);
  select * into s from public.lesson_series where id = p_series_id for update;

  if jsonb_array_length(v_preview -> 'meetings') = 0 then
    raise exception 'no_future_lessons' using errcode = 'P0001';
  end if;
  if (v_preview ->> 'outside_hours')::boolean and not coalesce(p_confirm_outside_hours, false) then
    raise exception 'outside_hours_confirm_required' using errcode = 'P0001';
  end if;

  if (v_preview ->> 'needs_request')::boolean then
    -- A new request replaces an earlier one to the teacher that is still waiting for an answer.
    perform public.discard_pending_requests(null, s.id);
    v_first := p_from_date + ((p_day - extract(dow from p_from_date)::integer + 7) % 7);
    v_first_start := public.local_ts(v_first, p_start);
    insert into public.exception_booking_requests (
      kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time, duration_minutes,
      first_start_at, outside_hours, requested_by, target_series_id, apply_from
    )
    values (
      'series_change', s.student_id, s.lesson_type_id, p_teacher_id, p_location, v_first, p_start, p_duration,
      v_first_start, (v_preview ->> 'outside_hours')::boolean, (select auth.uid()), s.id, p_from_date
    )
    returning id into v_id;
    perform public.log_event('series', s.id, 'series_change_requested', null,
      jsonb_build_object('from', p_from_date, 'teacher_id', p_teacher_id, 'request_id', v_id));
    return jsonb_build_object('result', 'request', 'id', v_id);
  end if;

  return jsonb_build_object('result', 'series') ||
    public.apply_series_change(s.id, p_from_date, p_day, p_start, p_duration, p_teacher_id, p_location, null, true);
end;
$$;
