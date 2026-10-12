-- Supabase owns the clock; the existing application keeps OAuth tokens and publishing logic.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists vorlen_internal;
revoke all on schema vorlen_internal from public,anon,authenticated,service_role;
create table if not exists vorlen_internal.linkedin_scheduler_dispatch (
 singleton boolean primary key default true check(singleton),
 request_id bigint, dispatched_at timestamptz
);
alter table vorlen_internal.linkedin_scheduler_dispatch enable row level security;
revoke all on vorlen_internal.linkedin_scheduler_dispatch from public,anon,authenticated,service_role;
insert into vorlen_internal.linkedin_scheduler_dispatch(singleton) values(true) on conflict do nothing;

create or replace function vorlen_internal.dispatch_linkedin_posts(p_probe boolean default false)
returns bigint language plpgsql security invoker set search_path='' as $$
declare token text; previous vorlen_internal.linkedin_scheduler_dispatch; request bigint;
begin
 -- Serialize dispatches and avoid another HTTP call while the previous worker runs.
 select * into previous from vorlen_internal.linkedin_scheduler_dispatch where singleton for update;
 if previous.request_id is not null and previous.dispatched_at>clock_timestamp()-interval '6 minutes'
   and not exists(select 1 from net._http_response where id=previous.request_id) then return previous.request_id;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='vorlen_linkedin_scheduler_token';
 if token is null or length(token)<32 then raise exception 'Vorlen scheduler secret is not configured in Vault';end if;
 select net.http_post(
  url:='https://connect.vorlen.co.uk/api/cron/linkedin-publish'||case when p_probe then '?probe=1' else '' end,
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  body:='{}'::jsonb,timeout_milliseconds:=290000
 ) into request;
 update vorlen_internal.linkedin_scheduler_dispatch set request_id=request,dispatched_at=clock_timestamp() where singleton;
 return request;
end $$;
revoke all on function vorlen_internal.dispatch_linkedin_posts(boolean) from public,anon,authenticated,service_role;
-- Create paused. Activate after Vault and production authentication are verified.
select cron.schedule('vorlen-connect-linkedin-publish','* * * * *','select vorlen_internal.dispatch_linkedin_posts();');
select cron.alter_job(jobid,active:=false) from cron.job where jobname='vorlen-connect-linkedin-publish';
