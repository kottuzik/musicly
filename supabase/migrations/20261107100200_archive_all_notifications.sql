-- Archive every waiting notification of one tab ('activity' or 'system') for the signed-in user,
-- across all pages. Archiving also marks as read; nothing is deleted.
create function public.archive_all_notifications(p_tab text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_tab not in ('activity', 'system') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.notifications set archived_at = now(), read_at = coalesce(read_at, now())
  where user_id = (select auth.uid()) and archived_at is null and category = p_tab::public.notification_category;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.archive_all_notifications(text) from public, anon, authenticated;
grant execute on function public.archive_all_notifications(text) to authenticated;
