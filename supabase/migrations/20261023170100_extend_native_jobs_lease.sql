-- Keep the worker lease alive while it persists each completed public job.
create or replace function public.vc_worker_progress(p_id uuid,p_lease uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.vc_worker_jobs set result=coalesce(p_result,'{}'::jsonb),lease_until=now()+interval '90 seconds',updated_at=now()
 where id=p_id and kind='linkedin_public_jobs' and state='leased' and lease_token=p_lease and lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.vc_worker_progress(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vc_worker_progress(uuid,uuid,jsonb) to service_role;
