-- Milestone 10, step 1: reports and the export log.
-- report_lessons_summary is the single source for the reports screen and for its CSV export.
-- Attendance columns count only lessons that are still scheduled, so a lesson cancelled after it
-- was marked "held" (or a closed day) is never counted as held; those get their own columns.

-- Exports of personal data are logged (kind and row count only, never content).
alter table public.audit_events drop constraint audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check check (entity in
  ('lesson', 'series', 'closure', 'lesson_type', 'student', 'teacher', 'change_request', 'export'));

create function public.report_lessons_summary(
  p_from date, p_to date, p_teacher_id uuid, p_group text
)
returns table (
  group_id uuid, group_name text, scheduled_total bigint, held bigint, student_absent bigint,
  teacher_absent bigint, unreported bigint, upcoming bigint, cancelled bigint, closed_day bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  perform public.require_admin();
  if p_group is null or p_group not in ('teacher', 'lesson_type', 'total')
     or p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_to - p_from > 365 then
    raise exception 'range_too_large' using errcode = 'P0001';
  end if;
  v_from := public.local_ts(p_from, time '00:00');
  v_to := public.local_ts(p_to + 1, time '00:00');

  return query
  select case p_group when 'teacher' then l.teacher_id when 'lesson_type' then l.lesson_type_id end,
         case p_group when 'teacher' then t.full_name when 'lesson_type' then lt.name else 'סה״כ' end,
         count(*) filter (where l.status = 'scheduled'),
         count(*) filter (where l.status = 'scheduled' and a.status = 'held'),
         count(*) filter (where l.status = 'scheduled' and a.status = 'student_absent'),
         count(*) filter (where l.status = 'scheduled' and a.status = 'teacher_absent'),
         count(*) filter (where l.status = 'scheduled' and a.lesson_id is null and l.end_at <= now()),
         count(*) filter (where l.status = 'scheduled' and a.lesson_id is null and l.end_at > now()),
         count(*) filter (where l.status = 'cancelled'),
         count(*) filter (where l.status = 'closed_day')
  from public.lessons l
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.attendance a on a.lesson_id = l.id
  where l.start_at >= v_from and l.start_at < v_to
    and (p_teacher_id is null or l.teacher_id = p_teacher_id)
  group by 1, 2
  order by 2;
end;
$$;

create function public.log_export(p_kind text, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_kind is null or p_kind not in ('students', 'teachers') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform public.log_event('export', gen_random_uuid(), 'export_created', null,
    jsonb_build_object('kind', p_kind, 'rows', p_rows));
end;
$$;

revoke execute on function
  public.report_lessons_summary(date, date, uuid, text),
  public.log_export(text, integer)
from public, anon, authenticated;

grant execute on function
  public.report_lessons_summary(date, date, uuid, text),
  public.log_export(text, integer)
to authenticated;
