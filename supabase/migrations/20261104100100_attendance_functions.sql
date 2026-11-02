-- Milestone 7, step 2: reporting attendance, and cancelling a lesson that already took place.
-- Business errors: errcode P0001 + a stable key.

-- Report or correct attendance. An admin may do it for any scheduled lesson; an active teacher only
-- for their own. p_version is the version of the existing report (null when there is none), so two
-- people correcting at once cannot overwrite each other silently. The audit log keeps the statuses
-- and whether a note exists, never the note text.
create function public.set_attendance(
  p_lesson_id uuid, p_status public.attendance_status, p_note text, p_version integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  a public.attendance;
  v_teacher uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_status is null or length(coalesce(v_note, '')) > 500 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- Locking the lesson serializes concurrent reports for it.
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    v_teacher := public.current_teacher_id();
    if v_teacher is null or l.teacher_id is distinct from v_teacher
       or not exists (select 1 from public.teachers where id = v_teacher and status = 'active') then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;

  if l.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled' using errcode = 'P0001';
  end if;

  select * into a from public.attendance where lesson_id = l.id for update;
  if found then
    if p_version is distinct from a.version then
      raise exception 'attendance_changed' using errcode = 'P0001';
    end if;
    if a.status = p_status and a.note is not distinct from v_note then
      return;
    end if;
    update public.attendance
    set status = p_status, note = v_note, updated_by = (select auth.uid())
    where lesson_id = l.id;
    perform public.log_event('lesson', l.id, 'attendance_changed',
      jsonb_build_object('status', a.status, 'has_note', a.note is not null),
      jsonb_build_object('status', p_status, 'has_note', v_note is not null));
  else
    if p_version is not null then
      raise exception 'attendance_changed' using errcode = 'P0001';
    end if;
    insert into public.attendance (lesson_id, status, note, reported_by, updated_by)
    values (l.id, p_status, v_note, (select auth.uid()), (select auth.uid()));
    perform public.log_event('lesson', l.id, 'attendance_reported', null,
      jsonb_build_object('status', p_status, 'has_note', v_note is not null));
  end if;
end;
$$;

-- Cancel: a lesson already marked "held" may be cancelled after the fact (even if it is in the
-- past), but only with explicit confirmation; its attendance report is then removed by the trigger
-- and kept in the audit log. Any other lesson that already started stays as it is.
drop function public.cancel_lesson(uuid, integer, text);

create function public.cancel_lesson(
  p_id uuid, p_version integer, p_reason text, p_confirm_held boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_att public.attendance_status;
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
  select status into v_att from public.attendance where lesson_id = l.id;
  if l.start_at <= now() and v_att is distinct from 'held' then
    raise exception 'lesson_past' using errcode = 'P0001';
  end if;
  if v_att = 'held' and not coalesce(p_confirm_held, false) then
    raise exception 'held_confirmation_required' using errcode = 'P0001';
  end if;
  perform public.do_cancel_lesson(l.id, 'admin', p_reason);
end;
$$;

-- Same rule when an admin approves a teacher's cancellation request for a lesson marked "held".
drop function public.decide_lesson_change_request(uuid, integer, boolean, text);

create function public.decide_lesson_change_request(
  p_id uuid, p_version integer, p_approve boolean, p_note text, p_confirm_held boolean default false
)
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
  if exists (select 1 from public.attendance where lesson_id = l.id and status = 'held')
     and not coalesce(p_confirm_held, false) then
    raise exception 'held_confirmation_required' using errcode = 'P0001';
  end if;
  update public.lesson_change_requests
  set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note
  where id = r.id;
  perform public.do_cancel_lesson(l.id, 'teacher_request', r.reason);
  perform public.log_event('change_request', r.id, 'change_request_approved', null,
    jsonb_build_object('lesson_id', r.lesson_id, 'kind', r.kind));
end;
$$;

revoke execute on function
  public.set_attendance(uuid, public.attendance_status, text, integer),
  public.cancel_lesson(uuid, integer, text, boolean),
  public.decide_lesson_change_request(uuid, integer, boolean, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.set_attendance(uuid, public.attendance_status, text, integer),
  public.cancel_lesson(uuid, integer, text, boolean),
  public.decide_lesson_change_request(uuid, integer, boolean, text, boolean)
to authenticated;
