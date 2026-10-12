-- Vorlen native minute-level scheduler (no publishing keys or bearer secrets in cron.job).
-- Production activation requires Vault secret 'vorlen_connect_cron_secret'.
-- Keep the existing Vercel daily schedule as a fallback until this job is verified.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.vc_dispatch_linkedin_due()
returns bigint
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  -- Do not dispatch if the Vault secret hasn't been provisioned.
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='vorlen_connect_cron_secret'
  limit 1;
  if v_secret is null or length(v_secret)<32 then
    return null;
  end if;

  select net.http_get(
    url:='https://connect.vorlen.co.uk/api/cron/linkedin-publish',
    headers:=pg_catalog.jsonb_build_object('Authorization','Bearer ' || v_secret),
    timeout_milliseconds:=12000
  ) into v_request_id;
  return v_request_id;
end
$$;
revoke all on function public.vc_dispatch_linkedin_due() from public, anon, authenticated;
-- pg_cron executes under postgres. No client can call this privileged dispatcher.
do $$
begin
  if not exists(select 1 from cron.job where jobname='vorlen-connect-linkedin-minute') then
    perform cron.schedule(
      'vorlen-connect-linkedin-minute',
      '* * * * *',
      'select public.vc_dispatch_linkedin_due()'
    );
  end if;
end
$$;
