-- Milestone 8, step 4: the e-mail sender's two database calls. Only the server (service role) may
-- run them. Claiming is atomic, so two overlapping runs never take the same message, and a
-- message that was claimed but never finished (a crash) becomes claimable again after 10 minutes.

create function public.claim_email_outbox(p_limit integer)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A message stuck in "sending" for its third attempt has used up its tries.
  update public.email_outbox
  set status = 'failed', last_error = 'stuck'
  where status = 'sending' and locked_until < now() and attempts >= 3;

  return query
  update public.email_outbox o
  set status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '10 minutes'
  where o.id in (
    select e.id from public.email_outbox e
    where (e.status = 'pending' and e.next_attempt_at <= now())
       or (e.status = 'sending' and e.locked_until < now())
    order by e.next_attempt_at
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  )
  returning o.*;
end;
$$;

-- p_result: 'sent', 'skipped' (test mode, recipient not allowed) or 'error' (retry later, and
-- give up after three tries, telling the admins once).
create function public.complete_email_outbox(p_id uuid, p_result text, p_provider_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.email_outbox;
begin
  select * into o from public.email_outbox where id = p_id for update;
  if not found or o.status <> 'sending' then
    return;
  end if;

  if p_result = 'sent' then
    update public.email_outbox
    set status = 'sent', sent_at = now(), provider_id = p_provider_id, locked_until = null, last_error = null
    where id = p_id;
  elsif p_result = 'skipped' then
    update public.email_outbox
    set status = 'skipped_test_mode', locked_until = null
    where id = p_id;
  elsif o.attempts >= 3 then
    update public.email_outbox
    set status = 'failed', locked_until = null, last_error = left(coalesce(p_error, 'error'), 300)
    where id = p_id;
    perform public.notify_admins('email_failed', 'system', 'email', p_id,
      jsonb_build_object('kind', o.kind), 'ef:' || p_id);
  else
    update public.email_outbox
    set status = 'pending', locked_until = null, last_error = left(coalesce(p_error, 'error'), 300),
        next_attempt_at = now() + case o.attempts when 1 then interval '5 minutes' else interval '30 minutes' end
    where id = p_id;
  end if;
end;
$$;

revoke execute on function
  public.claim_email_outbox(integer),
  public.complete_email_outbox(uuid, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.claim_email_outbox(integer),
  public.complete_email_outbox(uuid, text, text, text)
to service_role;
