-- Teachers' requests that still wait for an answer come first in the notification list (newest first
-- within each group); everything else follows, newest first. Same function and access rules as before.

create or replace function public.list_notifications(p_tab text, p_offset integer)
returns table (
  id uuid, type text, category public.notification_category, entity text, entity_id uuid,
  payload jsonb, created_at timestamptz, read_at timestamptz, archived_at timestamptz,
  subject_name text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_teacher uuid := public.current_teacher_id();
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return query
  select n.id, n.type, n.category, n.entity, n.entity_id, n.payload, n.created_at, n.read_at, n.archived_at,
         case
           when n.entity = 'lesson' and (v_admin or l.teacher_id = v_teacher) then ls.full_name
           when n.entity = 'series' and (v_admin or sr.teacher_id = v_teacher) then ss.full_name
           when n.entity = 'student' and v_admin then st.full_name
           when n.entity = 'change_request' and (v_admin or cr.teacher_id = v_teacher) then crs.full_name
           when n.entity = 'approval_request' and (v_admin or er.teacher_id = v_teacher) then ers.full_name
         end,
         count(*) over ()
  from public.notifications n
  left join public.lessons l on n.entity = 'lesson' and l.id = n.entity_id
  left join public.students ls on ls.id = l.student_id
  left join public.lesson_series sr on n.entity = 'series' and sr.id = n.entity_id
  left join public.students ss on ss.id = sr.student_id
  left join public.students st on n.entity = 'student' and st.id = n.entity_id
  left join public.lesson_change_requests cr on n.entity = 'change_request' and cr.id = n.entity_id
  left join public.lessons crl on crl.id = cr.lesson_id
  left join public.students crs on crs.id = crl.student_id
  left join public.exception_booking_requests er on n.entity = 'approval_request' and er.id = n.entity_id
  left join public.students ers on ers.id = er.student_id
  left join public.availability_requests ar on n.entity = 'availability_request' and ar.id = n.entity_id
  where n.user_id = (select auth.uid())
    and case p_tab
      when 'archive' then n.archived_at is not null
      when 'system' then n.archived_at is null and n.category = 'system'
      else n.archived_at is null and n.category = 'activity'
    end
  order by (n.type in ('change_request_new', 'availability_request_new', 'approval_request_new')
            and coalesce(cr.status::text, er.status::text, ar.status::text) = 'pending') desc,
           n.created_at desc
  limit 30 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
