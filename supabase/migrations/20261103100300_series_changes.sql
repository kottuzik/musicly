-- Milestone 6, step 4: changing, stopping and extending weekly series. Admins only.
-- A change "from a date" splits the series: the old one ends the day before, a new one takes the
-- future meetings with the new pattern. Past lessons never change. A meeting that cannot move
-- (taken time, date already passed) stays where it is in the old series, flagged for attention.
-- Business errors: errcode P0001 + a stable key.

-- ---------------------------------------------------------------------------
-- Internal: where each future meeting of a series would go
-- ---------------------------------------------------------------------------

-- outcome: 'move', 'closed_day' (moves but lands on a closed day), 'past' (the new date has
-- passed), or the problem: 'teacher_busy', 'student_busy', 'teacher_unavailable'.
create function public.series_move_plan(
  p_series uuid, p_from date, p_day smallint, p_start time, p_duration integer,
  p_teacher uuid, p_check_availability boolean
)
returns table (lesson_id uuid, old_start timestamptz, new_date date, new_start timestamptz, new_end timestamptz, outcome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l record;
  v_problem text;
begin
  for l in
    select x.id, x.student_id, x.occurrence_date, x.start_at
    from public.lessons x
    where x.series_id = p_series and x.occurrence_date >= p_from and x.start_at > now()
      and x.status in ('scheduled', 'closed_day')
    order by x.occurrence_date
  loop
    lesson_id := l.id;
    old_start := l.start_at;
    new_date := l.occurrence_date + (p_day - extract(dow from l.occurrence_date)::integer);
    new_start := public.local_ts(new_date, p_start);
    new_end := new_start + make_interval(mins => p_duration);
    if new_start <= now() then
      outcome := 'past';
    else
      v_problem := public.slot_problem(p_teacher, l.student_id, new_date, p_start, p_duration, l.id, p_check_availability);
      outcome := case when v_problem is null then 'move' else v_problem end;
    end if;
    return next;
  end loop;
end;
$$;

-- Applies a split to one series. Returns {"new_series_id", "moved", "flagged", "skipped"}.
create function public.split_series(
  p_series uuid, p_from date, p_day smallint, p_start time, p_duration integer,
  p_teacher uuid, p_location public.lesson_location, p_request uuid, p_check_availability boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  v_first date := p_from + ((p_day - extract(dow from p_from)::integer + 7) % 7);
  v_new uuid;
  v_moved integer := 0;
  v_flagged integer := 0;
  v_status public.lesson_status;
  v_skipped jsonb;
  p record;
  v_constraint text;
begin
  select * into s from public.lesson_series where id = p_series for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.status <> 'active' then
    raise exception 'series_ended' using errcode = 'P0001';
  end if;
  if s.end_date is not null and s.end_date < v_first then
    raise exception 'no_future_lessons' using errcode = 'P0001';
  end if;

  insert into public.lesson_series (
    student_id, lesson_type_id, teacher_id, day_of_week, start_time, duration_minutes, location,
    start_date, end_date, generated_until, outside_hours, exception_request_id, created_by
  )
  values (
    s.student_id, s.lesson_type_id, p_teacher, p_day, p_start, p_duration, p_location,
    v_first, s.end_date, greatest(s.generated_until, v_first - 1),
    not public.within_operating_hours(p_day, p_start, p_start + make_interval(mins => p_duration)),
    p_request, (select auth.uid())
  )
  returning id into v_new;

  for p in select * from public.series_move_plan(s.id, p_from, p_day, p_start, p_duration, p_teacher, p_check_availability) loop
    if p.outcome in ('move', 'closed_day') then
      v_status := case when p.outcome = 'closed_day' then 'closed_day' else 'scheduled' end;
      begin
        update public.lessons
        set series_id = v_new, teacher_id = p_teacher, occurrence_date = p.new_date, start_at = p.new_start,
            end_at = p.new_end, location = p_location, status = v_status,
            outside_hours = not public.within_operating_hours(p_day, p_start, p_start + make_interval(mins => p_duration)),
            requires_attention = false, attention_reason = null
        where id = p.lesson_id;
        v_moved := v_moved + 1;
      exception when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        update public.lessons
        set requires_attention = true, attention_reason = 'series_change_conflict'
        where id = p.lesson_id;
        v_flagged := v_flagged + 1;
      end;
    else
      update public.lessons
      set requires_attention = true, attention_reason = 'series_change_conflict'
      where id = p.lesson_id;
      v_flagged := v_flagged + 1;
    end if;
  end loop;

  update public.lesson_series
  set status = 'ended', end_date = greatest(start_date, p_from - 1)
  where id = s.id;

  v_skipped := public.generate_series_occurrences(v_new, public.series_window_end(s.end_date));
  perform public.log_event('series', s.id, 'series_changed',
    jsonb_build_object('teacher_id', s.teacher_id, 'day', s.day_of_week, 'start', s.start_time,
      'duration', s.duration_minutes, 'location', s.location),
    jsonb_build_object('new_series_id', v_new, 'from', p_from, 'teacher_id', p_teacher, 'day', p_day,
      'start', p_start, 'duration', p_duration, 'location', p_location, 'moved', v_moved, 'flagged', v_flagged));
  return jsonb_build_object('new_series_id', v_new, 'moved', v_moved, 'flagged', v_flagged, 'skipped', v_skipped);
end;
$$;

-- Splits the series and, when the teacher changes, makes the new teacher the student's regular
-- teacher for the subject — which moves the student's other active series of that subject to them
-- too, keeping their own days and times (PRD §4.5).
create function public.apply_series_change(
  p_series uuid, p_from date, p_day smallint, p_start time, p_duration integer,
  p_teacher uuid, p_location public.lesson_location, p_request uuid, p_check_availability boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  o public.lesson_series;
  v_result jsonb;
  v_others integer := 0;
begin
  select * into s from public.lesson_series where id = p_series;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if (select regular_teacher_id from public.student_subjects
      where student_id = s.student_id and lesson_type_id = s.lesson_type_id) is distinct from p_teacher then
    update public.student_subjects set regular_teacher_id = p_teacher
    where student_id = s.student_id and lesson_type_id = s.lesson_type_id;
    perform public.log_event('student', s.student_id, 'regular_teacher_changed', null,
      jsonb_build_object('lesson_type_id', s.lesson_type_id, 'teacher_id', p_teacher));

    for o in
      select * from public.lesson_series
      where student_id = s.student_id and lesson_type_id = s.lesson_type_id and status = 'active'
        and id <> s.id and teacher_id <> p_teacher
      order by day_of_week, start_time
    loop
      if (o.end_date is null or o.end_date >= p_from)
         and exists (select 1 from public.lessons x where x.series_id = o.id and x.occurrence_date >= p_from
                     and x.start_at > now() and x.status in ('scheduled', 'closed_day')) then
        perform public.split_series(o.id, p_from, o.day_of_week, o.start_time, o.duration_minutes,
          p_teacher, o.location, p_request, false);
        v_others := v_others + 1;
      end if;
    end loop;
  end if;

  v_result := public.split_series(s.id, p_from, p_day, p_start, p_duration, p_teacher, p_location, p_request, p_check_availability);
  return v_result || jsonb_build_object('other_series_moved', v_others);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: preview and apply a series change
-- ---------------------------------------------------------------------------

-- Per future meeting from the date: old and new time and what would happen, without writing.
-- When the teacher changes, the student's other series of the subject are included.
create function public.preview_series_change(
  p_series_id uuid, p_from_date date, p_day smallint, p_start time, p_duration integer,
  p_teacher_id uuid, p_location public.lesson_location
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  o public.lesson_series;
  v_rows jsonb;
  v_all jsonb := '[]'::jsonb;
  v_teacher_changes boolean;
begin
  perform public.require_admin();
  select * into s from public.lesson_series where id = p_series_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.status <> 'active' then
    raise exception 'series_ended' using errcode = 'P0001';
  end if;
  if p_from_date is null or p_day not between 0 and 6 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform public.check_booking(s.student_id, s.lesson_type_id, p_teacher_id, p_start, p_duration, false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_id', m.lesson_id, 'series_id', s.id, 'old_start', m.old_start, 'new_start', m.new_start, 'outcome', m.outcome
  ) order by m.new_start), '[]'::jsonb)
  into v_rows
  from public.series_move_plan(s.id, p_from_date, p_day, p_start, p_duration, p_teacher_id, true) m;
  v_all := v_rows;

  v_teacher_changes := (select regular_teacher_id from public.student_subjects
                        where student_id = s.student_id and lesson_type_id = s.lesson_type_id) is distinct from p_teacher_id;
  if v_teacher_changes then
    for o in
      select * from public.lesson_series
      where student_id = s.student_id and lesson_type_id = s.lesson_type_id and status = 'active'
        and id <> s.id and teacher_id <> p_teacher_id
    loop
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson_id', m.lesson_id, 'series_id', o.id, 'old_start', m.old_start, 'new_start', m.new_start, 'outcome', m.outcome
      ) order by m.new_start), '[]'::jsonb)
      into v_rows
      from public.series_move_plan(o.id, p_from_date, o.day_of_week, o.start_time, o.duration_minutes, p_teacher_id, true) m;
      v_all := v_all || v_rows;
    end loop;
  end if;

  return jsonb_build_object(
    'meetings', v_all,
    'outside_hours', not public.within_operating_hours(p_day, p_start, p_start + make_interval(mins => p_duration)),
    'needs_request', exists (select 1 from jsonb_array_elements(v_all) e where e ->> 'outcome' = 'teacher_unavailable'),
    'regular_teacher_changes', v_teacher_changes
  );
end;
$$;

-- Returns {"result": "series", ...counts} when applied, or {"result": "request", "id"} when some
-- meeting falls outside the new teacher's availability (they must approve; nothing changes yet).
create function public.change_series(
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
    if exists (
      select 1 from public.exception_booking_requests
      where target_series_id = s.id and status = 'pending'
    ) then
      raise exception 'change_request_pending' using errcode = 'P0001';
    end if;
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

-- ---------------------------------------------------------------------------
-- Admin: stop a series
-- ---------------------------------------------------------------------------

-- Cancels the future meetings from the date and ends the series. Past lessons stay.
create function public.stop_series(p_series_id uuid, p_from_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  l record;
  v_cancelled integer := 0;
begin
  perform public.require_admin();
  select * into s from public.lesson_series where id = p_series_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.status <> 'active' then
    raise exception 'series_ended' using errcode = 'P0001';
  end if;
  if p_from_date is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  for l in
    select id from public.lessons
    where series_id = s.id and occurrence_date >= p_from_date and start_at > now()
      and status in ('scheduled', 'closed_day')
    order by occurrence_date
  loop
    perform public.do_cancel_lesson(l.id, 'series_stopped', null);
    v_cancelled := v_cancelled + 1;
  end loop;

  update public.lesson_series
  set status = 'ended', end_date = greatest(start_date, p_from_date - 1)
  where id = s.id;

  perform public.log_event('series', s.id, 'series_stopped',
    jsonb_build_object('end_date', s.end_date), jsonb_build_object('from', p_from_date, 'cancelled', v_cancelled));
  return jsonb_build_object('cancelled', v_cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: extend, remove the end date, or resume a series
-- ---------------------------------------------------------------------------

-- What extending would do per weekly date: 'create' a missing meeting, 'restore' one cancelled by
-- a stop, 'problem' (with the reason), 'exists' or 'past'.
create function public.series_extend_plan(p_series uuid, p_from date, p_until date)
returns table (occurrence_date date, action text, reason text, lesson_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  l public.lessons;
  v_date date;
  v_outcome text;
  v_problem text;
begin
  select * into s from public.lesson_series where id = p_series;
  if not found then
    return;
  end if;
  v_date := greatest(p_from, s.start_date) + ((s.day_of_week - extract(dow from greatest(p_from, s.start_date))::integer + 7) % 7);

  while v_date <= p_until loop
    occurrence_date := v_date;
    reason := null;
    lesson_id := null;
    select * into l from public.lessons x where x.series_id = s.id and x.occurrence_date = v_date;
    if found then
      lesson_id := l.id;
      if l.status = 'cancelled' and l.cancel_source = 'series_stopped' then
        v_problem := public.slot_problem(s.teacher_id, s.student_id, v_date, s.start_time, s.duration_minutes, l.id,
                                         s.exception_request_id is null);
        if public.local_ts(v_date, s.start_time) <= now() then
          action := 'past';
        elsif v_problem is null or v_problem = 'closed_day' then
          action := 'restore';
        else
          action := 'problem';
          reason := v_problem;
        end if;
      else
        action := 'exists';
      end if;
    else
      select p.outcome into v_outcome
      from public.series_plan(s.teacher_id, s.student_id, s.day_of_week, s.start_time, s.duration_minutes,
                              v_date, v_date, s.exception_request_id is null) p;
      if v_outcome in ('scheduled', 'closed_day') then
        action := 'create';
      elsif v_outcome = 'past' then
        action := 'past';
      else
        action := 'problem';
        reason := v_outcome;
      end if;
    end if;
    return next;
    v_date := v_date + 7;
  end loop;
end;
$$;

-- p_end_date: the new last date (empty = no end). p_resume_from: needed only for a series that
-- was stopped; the weeks in between are not created.
create function public.preview_series_extend(p_series_id uuid, p_end_date date, p_resume_from date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  v_from date;
begin
  perform public.require_admin();
  select * into s from public.lesson_series where id = p_series_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if s.status = 'active' then
    if s.end_date is null or (p_end_date is not null and p_end_date <= s.end_date) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    v_from := s.generated_until + 1;
  else
    if p_resume_from is null or p_resume_from <= public.school_today()
       or (p_end_date is not null and p_end_date < p_resume_from) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    v_from := p_resume_from;
  end if;

  return (
    select jsonb_build_object(
      'create', count(*) filter (where action = 'create'),
      'restore', count(*) filter (where action = 'restore'),
      'problems', coalesce(jsonb_agg(jsonb_build_object('date', occurrence_date, 'reason', reason))
                           filter (where action = 'problem'), '[]'::jsonb)
    )
    from public.series_extend_plan(s.id, v_from, public.series_window_end(p_end_date))
  );
end;
$$;

create function public.extend_series(p_series_id uuid, p_end_date date, p_resume_from date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  p record;
  v_from date;
  v_restored integer := 0;
  v_skipped jsonb;
begin
  perform public.require_admin();
  select * into s from public.lesson_series where id = p_series_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if s.status = 'active' then
    if s.end_date is null or (p_end_date is not null and p_end_date <= s.end_date) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    v_from := s.generated_until + 1;
  else
    if p_resume_from is null or p_resume_from <= public.school_today()
       or (p_end_date is not null and p_end_date < p_resume_from) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    perform public.check_booking(s.student_id, s.lesson_type_id, s.teacher_id, s.start_time, s.duration_minutes, true);
    v_from := p_resume_from;
    for p in select * from public.series_extend_plan(s.id, v_from, public.series_window_end(p_end_date)) where action = 'restore' loop
      perform public.do_restore_lesson(p.lesson_id, p.occurrence_date, s.start_time,
        not public.within_operating_hours(s.day_of_week, s.start_time, s.start_time + make_interval(mins => s.duration_minutes)));
      v_restored := v_restored + 1;
    end loop;
    update public.lesson_series set status = 'active', generated_until = v_from - 1 where id = s.id;
  end if;

  update public.lesson_series set end_date = p_end_date where id = s.id;
  v_skipped := public.generate_series_occurrences(s.id, public.series_window_end(p_end_date));
  perform public.log_event('series', s.id, case when s.status = 'active' then 'series_extended' else 'series_resumed' end,
    jsonb_build_object('end_date', s.end_date, 'status', s.status),
    jsonb_build_object('end_date', p_end_date, 'resume_from', p_resume_from, 'restored', v_restored));
  return jsonb_build_object('restored', v_restored, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------------------
-- The teacher answers an approval request: now also a series change from a date
-- (replaces the step-3 version; same signature)
-- ---------------------------------------------------------------------------

create or replace function public.respond_exception_request(p_id uuid, p_version integer, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.exception_booking_requests;
  t public.lessons;
  v_end timestamptz;
  v_problem text;
  v_constraint text;
  v_lesson uuid;
  v_series uuid;
  v_skipped jsonb;
  v_split jsonb;
begin
  perform public.expire_exception_requests();

  select * into r from public.exception_booking_requests where id = p_id for update;
  if not found or r.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' or r.version <> p_version then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;

  if not p_approve then
    update public.exception_booking_requests
    set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = r.id;
    return jsonb_build_object('result', 'rejected');
  end if;

  v_end := r.first_start_at + make_interval(mins => r.duration_minutes);
  if r.kind in ('lesson_change', 'restore') then
    select * into t from public.lessons where id = r.target_lesson_id for update;
  end if;

  if not exists (select 1 from public.students where id = r.student_id and status = 'active') then
    v_problem := 'התלמיד אינו פעיל';
  elsif not exists (select 1 from public.student_subjects where student_id = r.student_id and lesson_type_id = r.lesson_type_id) then
    v_problem := 'התלמיד כבר אינו רשום לתחום';
  elsif r.kind = 'lesson_change' and (t.id is null or t.status <> 'scheduled' or t.start_at <= now()) then
    v_problem := 'השיעור המקורי כבר אינו זמין לשינוי';
  elsif r.kind = 'restore' and (t.id is null or t.status <> 'cancelled') then
    v_problem := 'השיעור כבר אינו מבוטל';
  elsif r.kind = 'series_change' and not exists (
    select 1 from public.lesson_series where id = r.target_series_id and status = 'active'
  ) then
    v_problem := 'הסדרה כבר אינה פעילה';
  elsif r.kind in ('single', 'lesson_change', 'restore') and public.closure_on(r.start_date) then
    v_problem := 'המועד חל ביום סגירה';
  -- A series change settles conflicts meeting by meeting (flagged), so it skips these checks.
  elsif r.kind <> 'series_change'
        and public.lesson_conflict_except(r.teacher_id, r.student_id, r.first_start_at, v_end, r.target_lesson_id) = 'teacher_busy' then
    v_problem := 'המועד כבר תפוס אצל המורה';
  elsif r.kind <> 'series_change'
        and public.lesson_conflict_except(r.teacher_id, r.student_id, r.first_start_at, v_end, r.target_lesson_id) = 'student_busy' then
    v_problem := 'המועד כבר תפוס אצל התלמיד';
  end if;

  if v_problem is null then
    begin
      if r.kind = 'single' then
        insert into public.lessons (
          occurrence_date, student_id, lesson_type_id, teacher_id, start_at, end_at, location,
          outside_hours, exception_request_id, created_by
        )
        values (
          r.start_date, r.student_id, r.lesson_type_id, r.teacher_id, r.first_start_at, v_end, r.location,
          r.outside_hours, r.id, r.requested_by
        )
        returning id into v_lesson;
      elsif r.kind = 'lesson_change' then
        perform public.do_update_lesson(
          t.id, r.teacher_id, r.start_date, r.start_time, r.duration_minutes, r.location, r.outside_hours);
        v_lesson := t.id;
      elsif r.kind = 'restore' then
        perform public.do_restore_lesson(t.id, r.start_date, r.start_time, r.outside_hours);
        v_lesson := t.id;
      elsif r.kind = 'series_change' then
        v_split := public.apply_series_change(
          r.target_series_id, r.apply_from, extract(dow from r.start_date)::smallint, r.start_time,
          r.duration_minutes, r.teacher_id, r.location, r.id, false);
        v_series := (v_split ->> 'new_series_id')::uuid;
        v_skipped := v_split -> 'skipped';
      else
        insert into public.lesson_series (
          student_id, lesson_type_id, teacher_id, day_of_week, start_time, duration_minutes, location,
          start_date, end_date, generated_until, outside_hours, exception_request_id, created_by
        )
        values (
          r.student_id, r.lesson_type_id, r.teacher_id, extract(dow from r.start_date)::smallint, r.start_time,
          r.duration_minutes, r.location, r.start_date, r.end_date, r.start_date - 1, r.outside_hours, r.id,
          r.requested_by
        )
        returning id into v_series;
        v_skipped := public.generate_series_occurrences(v_series, public.series_window_end(r.end_date));
      end if;
    exception
      when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        v_problem := case when public.overlap_error(v_constraint) = 'student_busy'
                          then 'המועד כבר תפוס אצל התלמיד' else 'המועד כבר תפוס אצל המורה' end;
      when raise_exception then
        v_problem := case sqlerrm
          when 'student_busy' then 'המועד כבר תפוס אצל התלמיד'
          when 'teacher_busy' then 'המועד כבר תפוס אצל המורה'
          else 'לא ניתן לבצע את השינוי' end;
    end;
  end if;

  if v_problem is not null then
    update public.exception_booking_requests
    set status = 'cannot_schedule', decided_by = (select auth.uid()), decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''), result_note = v_problem
    where id = r.id;
    return jsonb_build_object('result', 'cannot_schedule', 'reason', v_problem);
  end if;

  update public.exception_booking_requests
  set status = 'approved', decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''), lesson_id = v_lesson, series_id = v_series,
      result_note = case when jsonb_array_length(coalesce(v_skipped, '[]'::jsonb)) > 0
                         then 'חלק מהמפגשים לא נוצרו בגלל התנגשות' end
  where id = r.id;
  return jsonb_build_object('result', 'approved', 'skipped', coalesce(v_skipped, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.series_move_plan(uuid, date, smallint, time, integer, uuid, boolean),
  public.split_series(uuid, date, smallint, time, integer, uuid, public.lesson_location, uuid, boolean),
  public.apply_series_change(uuid, date, smallint, time, integer, uuid, public.lesson_location, uuid, boolean),
  public.preview_series_change(uuid, date, smallint, time, integer, uuid, public.lesson_location),
  public.change_series(uuid, date, smallint, time, integer, uuid, public.lesson_location, boolean),
  public.stop_series(uuid, date),
  public.series_extend_plan(uuid, date, date),
  public.preview_series_extend(uuid, date, date),
  public.extend_series(uuid, date, date)
from public, anon, authenticated;

grant execute on function
  public.preview_series_change(uuid, date, smallint, time, integer, uuid, public.lesson_location),
  public.change_series(uuid, date, smallint, time, integer, uuid, public.lesson_location, boolean),
  public.stop_series(uuid, date),
  public.preview_series_extend(uuid, date, date),
  public.extend_series(uuid, date, date)
to authenticated;
