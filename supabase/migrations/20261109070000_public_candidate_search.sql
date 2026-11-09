-- Public candidate search queue. No LinkedIn credentials or session state are used.
alter table public.vc_worker_jobs drop constraint if exists vc_worker_jobs_kind_check;
alter table public.vc_worker_jobs add constraint vc_worker_jobs_kind_check
  check (kind in ('health_probe','linkedin_public_jobs','public_candidate_search'));

create or replace function public.vc_candidate_search_control(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.vc_worker_jobs%rowtype; r jsonb;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner'; end if;
 if p_action='enqueue' then
  if jsonb_typeof(coalesce(p->'filters','{}'::jsonb))<>'object' then raise exception 'Invalid filters'; end if;
  insert into public.vc_worker_jobs(owner_id,kind,payload,state,max_attempts,dedupe_key)
  values(p_owner,'public_candidate_search',jsonb_build_object('filters',coalesce(p->'filters','{}'::jsonb),'items','[]'::jsonb), 'pending',2,gen_random_uuid()::text)
  returning * into j;
  r=jsonb_build_object('id',j.id,'state',j.state,'created_at',j.created_at);
 elsif p_action in ('status','results') then
  select * into j from public.vc_worker_jobs where id=(p->>'id')::uuid and owner_id=p_owner and kind='public_candidate_search';
  if not found then raise exception 'Candidate search job not found'; end if;
  r=jsonb_build_object('id',j.id,'state',j.state,'attempts',j.attempts,'created_at',j.created_at,'updated_at',j.updated_at,'result',j.result,'last_error',j.last_error);
 else raise exception 'Invalid candidate search action'; end if;
 return jsonb_build_object('rows',jsonb_build_array(r),'changes',1);
end $$;
revoke all on function public.vc_candidate_search_control(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_candidate_search_control(text,text,jsonb) to service_role;

create or replace function public.vc_worker_progress(p_id uuid,p_lease uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.vc_worker_jobs set result=coalesce(p_result,'{}'::jsonb),lease_until=now()+interval '90 seconds',updated_at=now()
 where id=p_id and kind in ('linkedin_public_jobs','public_candidate_search') and state='leased' and lease_token=p_lease and lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.vc_worker_progress(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vc_worker_progress(uuid,uuid,jsonb) to service_role;
