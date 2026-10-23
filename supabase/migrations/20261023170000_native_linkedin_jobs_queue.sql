-- Durable queue support for the native public LinkedIn jobs collector.
-- The Oracle worker only fetches public guest job pages; no login/session or evasion.
alter table public.vc_worker_jobs drop constraint if exists vc_worker_jobs_kind_check;
alter table public.vc_worker_jobs add constraint vc_worker_jobs_kind_check
  check (kind in ('health_probe','linkedin_public_jobs'));

create or replace function public.vc_native_jobs_control(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb:='[]'::jsonb; j public.vc_worker_jobs%rowtype; v_id uuid;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner'; end if;
 if p_action='enqueue' then
  if jsonb_typeof(coalesce(p->'filters','{}'::jsonb))<>'object' then raise exception 'Invalid filters'; end if;
  v_id=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  insert into public.vc_worker_jobs(id,owner_id,kind,payload,state,max_attempts,dedupe_key)
  values(v_id,p_owner,'linkedin_public_jobs',jsonb_build_object('filters',coalesce(p->'filters','{}'::jsonb),'items','[]'::jsonb,'completed',0,'pages_fetched',0), 'pending',3,v_id::text)
  returning * into j;
  r=jsonb_build_array(jsonb_build_object('id',j.id,'state',j.state,'created_at',j.created_at));
 elsif p_action in ('status','results') then
  select * into j from public.vc_worker_jobs where id=(p->>'id')::uuid and owner_id=p_owner and kind='linkedin_public_jobs';
  if not found then raise exception 'Job not found'; end if;
  r=jsonb_build_array(jsonb_build_object('id',j.id,'state',j.state,'attempts',j.attempts,'created_at',j.created_at,'updated_at',j.updated_at,'result',j.result,'last_error',j.last_error));
 else raise exception 'Invalid native jobs action'; end if;
 return jsonb_build_object('rows',r,'changes',jsonb_array_length(r));
end $$;
create or replace function public.vc_worker_progress(p_id uuid,p_lease uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.vc_worker_jobs set result=coalesce(p_result,'{}'::jsonb),updated_at=now()
 where id=p_id and kind='linkedin_public_jobs' and state='leased' and lease_token=p_lease and lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.vc_native_jobs_control(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_native_jobs_control(text,text,jsonb) to service_role;
revoke all on function public.vc_worker_progress(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vc_worker_progress(uuid,uuid,jsonb) to service_role;
