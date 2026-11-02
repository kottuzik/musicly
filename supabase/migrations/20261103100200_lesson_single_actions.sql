-- Milestone 6, step 3: changing, cancelling and restoring a single lesson.
-- Admins change and cancel; an admin or the lesson's own teacher restores. A change or restore
-- outside the teacher's availability becomes an approval request for that teacher and holds no
-- time until approved (PRD §4.2, §4.5). Business errors: errcode P0001 + a stable key.

-- ---------------------------------------------------------------------------
-- Internal: bring a cancelled lesson back at a given date and time
-- ---------------------------------------------------------------------------

create function public.do_restore_lesson(p_lesson_id uuid, p_date date, p_start time, p_outside boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_new public.lessons;
  v_start timestamptz := public.local_ts(p_date, p_start);
  v_constraint text;
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if l.status <> 'cancelled' then
    raise exception 'lesson_not_cancelled' using errcode = 'P0001';
  end if;

  begin
    update public.lessons
    set status = 'scheduled', requires_attention = false, attention_reason = null,
        cancelled_at = null, cancelled_by = null, cancel_source = null, cancel_reason = null,
        occurrence_date = p_date, start_at = v_start, end_at = v_start + (l.end_at - l.start_at),
        outside_hours = p_outside
    where id = l.id
    returning * into v_new;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', public.overlap_error(v_constraint) using errcode = 'P0001';
    when unique_violation then
      raise exception 'date_taken' using errcode = 'P0001';
  end;

  perform public.log_event('lesson', l.id, 'lesson_restored', public.lesson_snapshot(l), public.lesson_snapshot(v_new));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: what a change would do, without writing anything
-- ---------------------------------------------------------------------------

-- {"problem": null | closed_day | teacher_busy | student_busy, "outside_hours": bool, "needs_request": bool}
create function public.preview_lesson_change(
  p_lesson_id uuid, p_date date, p_start time, p_duration integer, p_teacher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_end_time time;
begin
  perform public.require_admin();
  select * into l from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform public.check_booking(l.student_id, l.lesson_type_id, p_teacher_id, p_start, p_duration, false);
  v_end_time := p_start + make_interval(mins => p_duration);

  return jsonb_build_object(
    'problem', public.slot_problem(p_teacher_id, l.student_id, p_date, p_start, p_duration, l.id, false),
    'outside_hours', not public.within_operating_hours(extract(dow from p_date)::smallint, p_start, v_end_time),
    'needs_request', not public.teacher_covers(p_teacher_id, p_date, p_start, v_end_time, true)
  );
end;
$$;

-- Active teachers of the lesson's subject who are free at its time, and whether the time is also
-- inside their availability (when not, using them sends them an approval request).
create function public.list_substitutes(p_lesson_id uuid)
returns table (teacher_id uuid, teacher_name text, available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_date date;
  v_start time;
  v_end time;
begin
  perform public.require_admin();
  select * into l from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_date := (l.start_at at time zone 'Asia/Jerusalem')::date;
  v_start := (l.start_at at time zone 'Asia/Jerusalem')::time;
  v_end := (l.end_at at time zone 'Asia/Jerusalem')::time;

  return query
  select t.id, p.full_name,
         public.teacher_covers(t.id, v_date, v_start, v_end, true)
  from public.teachers t
  join public.profiles p on p.id = t.profile_id
  join public.teacher_skills sk on sk.teacher_id = t.id and sk.lesson_type_id = l.lesson_type_id
  where t.status = 'active' and t.id <> l.teacher_id
    and public.lesson_conflict_except(t.id, l.student_id, l.start_at, l.end_at, l.id) is null
  order by p.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: change one lesson
-- ---------------------------------------------------------------------------

-- Returns {"result": "lesson", "id"} when done, or {"result": "request", "id"} when the new time
-- is outside the teacher's availability and needs their approval (the lesson stays where it is).
-- p_change_request_id: a teacher's change request this decision answers; it is marked approved.
create function public.update_lesson(
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
  if exists (
    select 1 from public.exception_booking_requests
    where target_lesson_id = l.id and status = 'pending'
  ) then
    raise exception 'change_request_pending' using errcode = 'P0001';
  end if;

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

-- ---------------------------------------------------------------------------
-- Admin: cancel, and clear the "needs attention" flag
-- ---------------------------------------------------------------------------

create function public.cancel_lesson(p_id uuid, p_version integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
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
  perform public.do_cancel_lesson(l.id, 'admin', p_reason);
end;
$$;

-- "Leave it as it is": the admin looked at a flagged lesson and keeps it unchanged.
create function public.clear_lesson_attention(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
begin
  perform public.require_admin();
  select * into l from public.lessons where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if l.version <> p_version then
    raise exception 'lesson_changed' using errcode = 'P0001';
  end if;
  if not l.requires_attention then
    return;
  end if;
  update public.lessons set requires_attention = false, attention_reason = null where id = l.id;
  perform public.log_event('lesson', l.id, 'attention_cleared',
    jsonb_build_object('attention_reason', l.attention_reason), null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Restore a cancelled lesson (admin, or the lesson's own active teacher)
-- ---------------------------------------------------------------------------

-- p_date / p_start empty = the original time. A taken time returns
-- {"result": "slot_taken", "suggestions": ["HH:MM", ...]} for the same day. Outside the school's
-- hours both roles must confirm. Outside the teacher's availability: a teacher restoring their
-- own lesson counts as consent (logged for the admins); an admin's restore becomes an approval
-- request. A time that already passed needs no availability check.
create function public.restore_lesson(
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
    if exists (
      select 1 from public.exception_booking_requests
      where target_lesson_id = l.id and status = 'pending'
    ) then
      raise exception 'change_request_pending' using errcode = 'P0001';
    end if;
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

-- ---------------------------------------------------------------------------
-- The teacher answers an approval request (replaces the M5 version; same signature)
-- Approval re-checks everything; a time taken in the meantime closes it as cannot_schedule.
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
  elsif r.kind in ('single', 'lesson_change', 'restore') and public.closure_on(r.start_date) then
    v_problem := 'המועד חל ביום סגירה';
  elsif public.lesson_conflict_except(r.teacher_id, r.student_id, r.first_start_at, v_end, r.target_lesson_id) = 'teacher_busy' then
    v_problem := 'המועד כבר תפוס אצל המורה';
  elsif public.lesson_conflict_except(r.teacher_id, r.student_id, r.first_start_at, v_end, r.target_lesson_id) = 'student_busy' then
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
  public.do_restore_lesson(uuid, date, time, boolean),
  public.preview_lesson_change(uuid, date, time, integer, uuid),
  public.list_substitutes(uuid),
  public.update_lesson(uuid, integer, date, time, integer, uuid, public.lesson_location, boolean, uuid),
  public.cancel_lesson(uuid, integer, text),
  public.clear_lesson_attention(uuid, integer),
  public.restore_lesson(uuid, integer, date, time, boolean)
from public, anon, authenticated;

grant execute on function
  public.preview_lesson_change(uuid, date, time, integer, uuid),
  public.list_substitutes(uuid),
  public.update_lesson(uuid, integer, date, time, integer, uuid, public.lesson_location, boolean, uuid),
  public.cancel_lesson(uuid, integer, text),
  public.clear_lesson_attention(uuid, integer),
  public.restore_lesson(uuid, integer, date, time, boolean)
to authenticated;
