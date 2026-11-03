-- Milestone 8 follow-up: when an admin turns down a teacher's change request, they can suggest
-- another time instead. The request is still rejected (nothing is booked); the suggestion is kept
-- on the request, added to the note the teacher reads, and sent in the teacher's notification.

alter table public.lesson_change_requests
  add column counter_date date,
  add column counter_start_time time,
  add constraint lesson_change_requests_counter_together check ((counter_date is null) = (counter_start_time is null));

drop function public.decide_lesson_change_request(uuid, integer, boolean, text, boolean);

create function public.decide_lesson_change_request(
  p_id uuid, p_version integer, p_approve boolean, p_note text, p_confirm_held boolean default false,
  p_counter_date date default null, p_counter_start time default null
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
    if (p_counter_date is null) <> (p_counter_start is null)
       or (p_counter_date is not null and (p_counter_date < public.school_today() or not public.is_quarter_hour(p_counter_start))) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    if p_counter_date is not null then
      v_note := concat_ws(' · ', left(v_note, 400),
        'הצעת המנהל: ' || to_char(p_counter_date, 'DD/MM/YYYY') || ' בשעה ' || to_char(p_counter_start, 'HH24:MI'));
    end if;
    update public.lesson_change_requests
    set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note,
        counter_date = p_counter_date, counter_start_time = p_counter_start
    where id = r.id;
    perform public.log_event('change_request', r.id, 'change_request_rejected', null,
      jsonb_build_object('lesson_id', r.lesson_id, 'kind', r.kind, 'suggested', p_counter_date is not null));
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

revoke execute on function public.decide_lesson_change_request(uuid, integer, boolean, text, boolean, date, time)
from public, anon, authenticated;
grant execute on function public.decide_lesson_change_request(uuid, integer, boolean, text, boolean, date, time)
to authenticated;

-- The teacher's notification of a rejected request carries the suggested time.
create or replace function public.lesson_change_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_payload jsonb;
begin
  select * into l from public.lessons where id = new.lesson_id;
  v_payload := coalesce(public.lesson_notice(l), '{}'::jsonb)
    || jsonb_build_object('request_id', new.id, 'kind', new.kind);

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_admins('change_request_new', 'activity', 'change_request', new.id,
        v_payload, 'cr:' || new.id || ':new', new.requested_by);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    if new.requested_by is distinct from new.decided_by then
      if new.counter_date is not null then
        v_payload := v_payload || jsonb_build_object('suggested_date', new.counter_date, 'suggested_start', new.counter_start_time);
      end if;
      perform public.notify(new.requested_by, 'change_request_' || new.status, 'activity', 'change_request', new.id,
        v_payload, 'cr:' || new.id || ':' || new.status);
    end if;
  elsif old.status = 'pending' and new.status = 'cancelled' and new.decided_by is null then
    -- Closed by the system (the lesson started or was handled), not by a person.
    perform public.notify(new.requested_by, 'change_request_closed', 'system', 'change_request', new.id,
      v_payload, 'cr:' || new.id || ':closed');
  end if;
  return null;
end;
$$;
