-- Milestone 6, step 5: a teacher asks an admin to change or cancel one of their lessons.
-- The teacher can ask until the day before the lesson; on the day itself they arrange it with the
-- admin directly (PRD §3.4). The admin approves a cancellation here; a change is approved by
-- setting the new time with update_lesson, which closes the request. Business errors: errcode
-- P0001 + a stable key.

-- Pending requests whose lesson has already started close on their own. Idempotent; runs before
-- the request screens load and before decisions (Cron scheduling comes with M8).
create function public.expire_lesson_change_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.lesson_change_requests r
  set status = 'cancelled', decided_at = now(), decision_note = 'השיעור התחיל לפני שהתקבלה תשובה'
  from public.lessons l
  where r.lesson_id = l.id and r.status = 'pending' and l.start_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Returns the new request id. p_kind 'cancel' takes no proposed time; for 'change' a proposed new
-- date and time are optional but come together.
create function public.request_lesson_change(
  p_lesson_id uuid, p_kind public.lesson_change_kind, p_date date, p_start time, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  l public.lessons;
  v_id uuid;
  v_date date := case when p_kind = 'change' then p_date end;
  v_start time := case when p_kind = 'change' then p_start end;
begin
  if v_teacher is null or not exists (select 1 from public.teachers where id = v_teacher and status = 'active') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found or l.teacher_id is distinct from v_teacher then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if l.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled' using errcode = 'P0001';
  end if;
  if l.start_at <= now() then
    raise exception 'lesson_past' using errcode = 'P0001';
  end if;
  if l.occurrence_date <= public.school_today() then
    raise exception 'request_too_late' using errcode = 'P0001';
  end if;
  if (v_date is null) <> (v_start is null) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if v_start is not null then
    if not public.is_quarter_hour(v_start) then
      raise exception 'invalid_time_step' using errcode = 'P0001';
    end if;
    if public.local_ts(v_date, v_start) <= now() then
      raise exception 'date_past' using errcode = 'P0001';
    end if;
  end if;

  perform public.expire_lesson_change_requests();
  begin
    insert into public.lesson_change_requests (
      lesson_id, teacher_id, kind, proposed_date, proposed_start_time, reason, requested_by
    )
    values (l.id, v_teacher, p_kind, v_date, v_start, nullif(trim(coalesce(p_reason, '')), ''), (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'change_request_pending' using errcode = 'P0001';
  end;

  perform public.log_event('change_request', v_id, 'change_requested', null,
    jsonb_build_object('lesson_id', l.id, 'kind', p_kind));
  return v_id;
end;
$$;

-- An admin answers. Approving a cancellation cancels the lesson. Approving a change is done with
-- update_lesson(..., p_change_request_id), so the admin picks the time and every check runs.
create function public.decide_lesson_change_request(p_id uuid, p_version integer, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.lesson_change_requests;
  l public.lessons;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.require_admin();
  perform public.expire_lesson_change_requests();

  select * into r from public.lesson_change_requests where id = p_id for update;
  if not found or r.status <> 'pending' or r.version <> p_version then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;

  if not p_approve then
    update public.lesson_change_requests
    set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note
    where id = r.id;
    perform public.log_event('change_request', r.id, 'change_request_rejected', null,
      jsonb_build_object('lesson_id', r.lesson_id, 'kind', r.kind));
    return;
  end if;

  if r.kind = 'change' then
    raise exception 'change_requires_update' using errcode = 'P0001';
  end if;

  select * into l from public.lessons where id = r.lesson_id for update;
  if not found or l.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled' using errcode = 'P0001';
  end if;
  update public.lesson_change_requests
  set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note
  where id = r.id;
  perform public.do_cancel_lesson(l.id, 'teacher_request', r.reason);
  perform public.log_event('change_request', r.id, 'change_request_approved', null,
    jsonb_build_object('lesson_id', r.lesson_id, 'kind', r.kind));
end;
$$;

-- The teacher withdraws their own pending request.
create function public.cancel_lesson_change_request(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_lesson_change_requests();
  update public.lesson_change_requests
  set status = 'cancelled', decided_by = (select auth.uid()), decided_at = now()
  where id = p_id and status = 'pending' and version = p_version
    and teacher_id = public.current_teacher_id();
  if not found then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;
end;
$$;

-- Requests with names: admins see all, a teacher sees their own.
create function public.list_lesson_change_requests(p_pending_only boolean)
returns table (
  id uuid, lesson_id uuid, kind public.lesson_change_kind, status public.request_status, version integer,
  proposed_date date, proposed_start_time time, reason text, decision_note text,
  created_at timestamptz, decided_at timestamptz,
  teacher_id uuid, teacher_name text, student_name text, lesson_type_name text, color text,
  lesson_start_at timestamptz, lesson_end_at timestamptz, lesson_location public.lesson_location,
  lesson_status public.lesson_status, lesson_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform public.expire_lesson_change_requests();

  return query
  select r.id, r.lesson_id, r.kind, r.status, r.version, r.proposed_date, r.proposed_start_time, r.reason,
         r.decision_note, r.created_at, r.decided_at, r.teacher_id, t.full_name, s.full_name, lt.name, lt.color,
         l.start_at, l.end_at, l.location, l.status, l.version
  from public.lesson_change_requests r
  join public.lessons l on l.id = r.lesson_id
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = r.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where (v_role <> 'teacher' or r.teacher_id = public.current_teacher_id())
    and (not coalesce(p_pending_only, false) or r.status = 'pending')
  order by case when r.status = 'pending' then 0 else 1 end, l.start_at
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.expire_lesson_change_requests(),
  public.request_lesson_change(uuid, public.lesson_change_kind, date, time, text),
  public.decide_lesson_change_request(uuid, integer, boolean, text),
  public.cancel_lesson_change_request(uuid, integer),
  public.list_lesson_change_requests(boolean)
from public, anon, authenticated;

grant execute on function
  public.expire_lesson_change_requests(),
  public.request_lesson_change(uuid, public.lesson_change_kind, date, time, text),
  public.decide_lesson_change_request(uuid, integer, boolean, text),
  public.cancel_lesson_change_request(uuid, integer),
  public.list_lesson_change_requests(boolean)
to authenticated;
