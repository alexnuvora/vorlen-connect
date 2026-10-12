-- Vorlen worker queue. Only service_role may enqueue, claim, complete or fail.
create table if not exists public.vc_worker_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id text not null,
 kind text not null check (kind in ('health_probe')),
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
 state text not null default 'pending' check (state in ('pending','leased','succeeded','failed')),
 dedupe_key text,
 attempts integer not null default 0,
 max_attempts integer not null default 3 check (max_attempts between 1 and 10),
 run_after timestamptz not null default now(),
 lease_until timestamptz,
 lease_token uuid,
 worker_id text,
 result jsonb,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id, dedupe_key)
);
create index if not exists vc_worker_jobs_ready on public.vc_worker_jobs(run_after,created_at) where state='pending';
create index if not exists vc_worker_jobs_leases on public.vc_worker_jobs(lease_until) where state='leased';
alter table public.vc_worker_jobs enable row level security;
revoke all on public.vc_worker_jobs from anon,authenticated,public;
grant select,insert,update on public.vc_worker_jobs to service_role;

create or replace function public.vc_worker_claim(p_worker text)
returns table(id uuid, owner_id text, kind text, payload jsonb, lease_token uuid, attempts integer)
language plpgsql security definer set search_path='' as $$
begin
 if nullif(trim(p_worker),'') is null or length(p_worker)>100 then raise exception 'Invalid worker identifier'; end if;
 return query
 with picked as (
  select j.id from public.vc_worker_jobs j
  where (j.state='pending' and j.run_after<=now())
     or (j.state='leased' and j.lease_until<now() and j.attempts<j.max_attempts)
  order by j.created_at for update skip locked limit 1
 ), claimed as (
  update public.vc_worker_jobs j
  set state='leased', worker_id=p_worker, lease_token=gen_random_uuid(),
      lease_until=now()+interval '90 seconds', attempts=j.attempts+1,updated_at=now()
  where j.id in(select picked.id from picked)
  returning j.*
 )
 select c.id,c.owner_id,c.kind,c.payload,c.lease_token,c.attempts from claimed c;
end $$;

create or replace function public.vc_worker_finish(p_id uuid,p_lease uuid,p_success boolean,p_result jsonb default '{}'::jsonb,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.vc_worker_jobs j
 set state=case when p_success then 'succeeded' when attempts>=max_attempts then 'failed' else 'pending' end,
     result=case when p_success then coalesce(p_result,'{}'::jsonb) else null end,
     last_error=case when p_success then null else left(coalesce(p_error,'Worker failed'),500) end,
     run_after=case when not p_success then now()+(least(power(2,attempts)::integer,32)*interval '1 minute') else j.run_after end,
     lease_until=null,lease_token=null,updated_at=now()
 where j.id=p_id and j.state='leased' and j.lease_token=p_lease and j.lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.vc_worker_claim(text) from public,anon,authenticated;
revoke all on function public.vc_worker_finish(uuid,uuid,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.vc_worker_claim(text) to service_role;
grant execute on function public.vc_worker_finish(uuid,uuid,boolean,jsonb,text) to service_role;
