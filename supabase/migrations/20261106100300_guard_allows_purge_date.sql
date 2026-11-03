-- Milestone 9: a deleted student or teacher may not be edited, but moving the purge date alone is
-- harmless (it cannot bring anything back), and the tests need it to age a deletion past 30 days.
create or replace function public.guard_deleted_person_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.person_maintenance', true), '') = '1' then
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is not null
     and (to_jsonb(new) - 'purge_after' - 'updated_at') is distinct from (to_jsonb(old) - 'purge_after' - 'updated_at') then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
