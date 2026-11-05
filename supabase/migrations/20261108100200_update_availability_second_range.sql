-- Editing a weekly availability slot may also split it into two ranges on the same day, for example
-- 10:00-13:00 and 16:00-21:00. Both are saved together or not at all.
-- A teacher may do this directly only if nothing is removed, meaning the old hours sit entirely inside
-- one of the new ranges; otherwise it needs a removal request (PRD §4.2).

drop function public.update_availability(uuid, time, time);

create function public.update_availability(
  p_availability_id uuid,
  p_start time,
  p_end time,
  p_second_start time default null,
  p_second_end time default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.teacher_availability;
  v_admin boolean := public.is_admin();
  v_second boolean := p_second_start is not null;
  v_keeps_all boolean;
  v_flagged integer := 0;
begin
  select * into s from public.teacher_availability where id = p_availability_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_admin and s.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachers where id = s.teacher_id and status = 'active') then
    raise exception 'teacher_inactive' using errcode = 'P0001';
  end if;
  if p_start is null or p_end is null or p_end <= p_start
     or not public.is_quarter_hour(p_start) or not public.is_quarter_hour(p_end) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;
  if (p_second_start is null) <> (p_second_end is null) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if v_second and (
    p_second_end <= p_second_start or p_second_start < p_end
    or not public.is_quarter_hour(p_second_start) or not public.is_quarter_hour(p_second_end)
  ) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;
  if not public.within_operating_hours(s.day_of_week, p_start, p_end)
     or (v_second and not public.within_operating_hours(s.day_of_week, p_second_start, p_second_end)) then
    raise exception 'outside_operating_hours' using errcode = 'P0001';
  end if;
  if s.valid_to is not null then
    raise exception 'availability_ending' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.availability_requests
    where availability_id = s.id and kind = 'remove_weekly' and status = 'pending'
  ) then
    raise exception 'removal_pending' using errcode = 'P0001';
  end if;

  v_keeps_all := (p_start <= s.start_time and p_end >= s.end_time)
    or (v_second and p_second_start <= s.start_time and p_second_end >= s.end_time);
  if not v_keeps_all and not v_admin then
    raise exception 'availability_narrowing_needs_request' using errcode = 'P0001';
  end if;

  begin
    update public.teacher_availability set start_time = p_start, end_time = p_end where id = s.id;
    if v_second then
      insert into public.teacher_availability (teacher_id, day_of_week, start_time, end_time, valid_from, created_by)
      values (s.teacher_id, s.day_of_week, p_second_start, p_second_end, public.school_today(), (select auth.uid()));
    end if;
  exception when exclusion_violation then
    raise exception 'availability_overlap' using errcode = 'P0001';
  end;

  -- Only lessons the old hours covered and the teacher's availability no longer covers.
  if not v_keeps_all then
    update public.lessons l
    set requires_attention = true, attention_reason = 'availability_removed'
    where l.teacher_id = s.teacher_id
      and l.status = 'scheduled'
      and l.start_at > now()
      and l.attention_reason is null
      and extract(dow from l.occurrence_date)::smallint = s.day_of_week
      and l.occurrence_date >= s.valid_from
      and (l.start_at at time zone 'Asia/Jerusalem')::time >= s.start_time
      and (l.end_at at time zone 'Asia/Jerusalem')::time <= s.end_time
      and not public.teacher_covers(
        s.teacher_id, l.occurrence_date,
        (l.start_at at time zone 'Asia/Jerusalem')::time,
        (l.end_at at time zone 'Asia/Jerusalem')::time,
        false
      );
    get diagnostics v_flagged = row_count;
  end if;

  perform public.log_event(
    'teacher', s.teacher_id, 'availability_updated',
    jsonb_build_object('day_of_week', s.day_of_week, 'start_time', s.start_time, 'end_time', s.end_time),
    jsonb_build_object('start_time', p_start, 'end_time', p_end, 'second_start_time', p_second_start,
      'second_end_time', p_second_end, 'flagged_lessons', v_flagged)
  );
  return v_flagged;
end;
$$;

revoke execute on function public.update_availability(uuid, time, time, time, time) from public, anon, authenticated;
grant execute on function public.update_availability(uuid, time, time, time, time) to authenticated;
