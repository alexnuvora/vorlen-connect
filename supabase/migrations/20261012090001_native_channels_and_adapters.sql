-- CLI-generated migration ordered after the existing future-dated broker baseline.
alter table public.vc_linkedin_session_connections add column channel text not null default 'linkedin' check(channel in ('linkedin','email'));
alter table public.vc_session_jobs drop constraint vc_session_jobs_operation_check;
alter table public.vc_session_jobs add constraint vc_session_jobs_operation_check check(operation in ('connect','import','verify','refresh','profile','inbox','conversation','invitations','connections','search_people','recruiter','send_message','send_invitation','disconnect','contact','company','search_companies','sent_invitations','network_status','feed','post_comments','emails','connect_mail','send_email'));
-- Owner-scoped session connection management. No secrets or cookies are accepted.
create or replace function public.vc_session_manage(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb:='[]'::jsonb; n integer:=0; v_id uuid; v_label text;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner'; end if;
 case p_action
 when 'list' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into r from (
   select id,label,channel,state,verification_kind,profile_id,last_verified_at,expires_at,last_error_code,revision,created_at,updated_at
   from public.vc_linkedin_session_connections
   where owner_id=p_owner order by created_at desc limit 50
  ) t;
 when 'create' then
  v_label=trim(coalesce(p->>'label',''));
  if length(v_label) not between 1 and 100 then raise exception 'Invalid label'; end if;
  insert into public.vc_linkedin_session_connections(owner_id,label,channel) values(p_owner,v_label,coalesce(p->>'channel','linkedin')) returning id into v_id;
  insert into public.vc_linkedin_session_events(connection_id,owner_id,previous_state,next_state,event_type,actor)
  values(v_id,p_owner,null,'disconnected','created','owner');
  r=jsonb_build_array(jsonb_build_object('id',v_id,'state','disconnected'));
  n=1;
 when 'revoke' then
  if coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Invalid connection identifier'; end if;
  v_id=(p->>'id')::uuid;
  with changed as (
    update public.vc_linkedin_session_connections
    set state='revoked',session_reference=null,profile_id=null,verification_kind=null,expires_at=null,
        last_verified_at=null,last_error_code=null,revision=revision+1,updated_at=now()
    where owner_id=p_owner and id=v_id and state <> 'revoked'
    returning id
  ) select count(*) into n from changed;
  if n=1 then
    insert into public.vc_linkedin_session_events(connection_id,owner_id,previous_state,next_state,event_type,actor)
    values(v_id,p_owner,null,'revoked','owner_revocation','owner');
  end if;
  r=jsonb_build_array(jsonb_build_object('revoked',n=1));
 else raise exception 'Invalid session action';
 end case;
 return jsonb_build_object('rows',r,'changes',n);
end $$;
revoke all on function public.vc_session_manage(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_session_manage(text,text,jsonb) to service_role;

create or replace function public.vc_session_broker(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.vc_linkedin_session_connections%rowtype; j public.vc_session_jobs%rowtype;
 r jsonb:='[]'; v_id uuid; is_write boolean; n integer:=0; next_state text;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner';end if;
 if p_action='health' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (select last_seen,version from public.vc_session_worker_health where owner_id=p_owner)t;
 elsif p_action='job' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (
   select id,connection_id,operation,state,public_input,content_hash,encrypted_result,error_code,created_at,updated_at
   from public.vc_session_jobs where owner_id=p_owner and id=(p->>'id')::uuid)t;
 elsif p_action='jobs' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (
   select id,connection_id,operation,state,public_input,content_hash,error_code,created_at,updated_at
   from public.vc_session_jobs where owner_id=p_owner order by created_at desc limit 30)t;
 elsif p_action='enqueue' then
  select * into c from public.vc_linkedin_session_connections where owner_id=p_owner and id=(p->>'connection_id')::uuid for update;
  if not found or c.state='revoked' then raise exception 'Connection not available';end if;
  if exists(select 1 from public.vc_session_jobs where connection_id=c.id and state in('pending','leased') and expires_at>now()) then raise exception 'Connection busy';end if;
  if (c.channel='email') is distinct from (p->>'operation' in ('connect_mail','emails','send_email')) then raise exception 'Wrong account channel';end if;
  is_write=p->>'operation' in('send_message','send_invitation','send_email');
  if is_write then
   select * into j from public.vc_session_jobs where owner_id=p_owner and connection_id=c.id and content_hash=p->>'content_hash' and state not in('cancelled','failed') and created_at>now()-interval '24 hours' order by created_at desc limit 1;
   if found then return jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('job_id',j.id,'state',j.state,'content_hash',j.content_hash,'deduplicated',true)),'changes',0);end if;
  end if;
  if p->>'operation' in('connect','import','connect_mail') then
   if c.state not in('disconnected','expired','error','verification_required') then raise exception 'Reconnect requires disconnected or expired session';end if;
   update public.vc_linkedin_session_connections set state='awaiting_login',revision=revision+1,last_error_code=null,updated_at=now() where id=c.id returning * into c;
  elsif p->>'operation' in('verify','refresh') then
   if c.state<>'verification_required' then raise exception 'Verification is not pending';end if;
  elsif c.state<>'connected' or c.expires_at<=now() then raise exception 'Session not connected';
  end if;
  v_id=(p->>'id')::uuid;
  insert into public.vc_session_jobs(id,owner_id,connection_id,operation,state,connection_revision,encrypted_input,public_input,content_hash,expires_at)
  values(v_id,p_owner,c.id,p->>'operation',case when is_write then 'draft' else 'pending' end,c.revision,p->>'encrypted_input',coalesce(p->'public_input','{}'),p->>'content_hash',now()+case when is_write then interval '24 hours' else interval '5 minutes' end);
  insert into public.vc_linkedin_session_events(connection_id,owner_id,next_state,event_type,actor) values(c.id,p_owner,c.state,'job_created:'||(p->>'operation'),'owner');
  r=jsonb_build_array(jsonb_build_object('job_id',v_id,'state',case when is_write then 'draft' else 'pending' end,'content_hash',p->>'content_hash'));n=1;
 elsif p_action in('approve','cancel') then
  select * into j from public.vc_session_jobs where owner_id=p_owner and id=(p->>'id')::uuid for update;
  if not found or j.state<>'draft' then raise exception 'Draft is no longer pending approval';end if;
  if p_action='approve' then
   if j.content_hash is distinct from p->>'content_hash' or j.expires_at<=now() then raise exception 'Draft changed or expired';end if;
   select * into c from public.vc_linkedin_session_connections where owner_id=p_owner and id=j.connection_id for update;
   if c.state<>'connected' or c.revision<>j.connection_revision or c.expires_at<=now() then raise exception 'Connection changed';end if;
   if exists(select 1 from public.vc_session_jobs where connection_id=c.id and state in('pending','leased') and expires_at>now()) then raise exception 'Connection busy';end if;
   update public.vc_session_jobs set state='pending',expires_at=now()+interval '5 minutes',updated_at=now() where id=j.id;
  else update public.vc_session_jobs set state='cancelled',encrypted_input=null,updated_at=now() where id=j.id;end if;
  insert into public.vc_linkedin_session_events(connection_id,owner_id,next_state,event_type,actor) values(j.connection_id,p_owner,'connected','job_'||p_action,'owner');
  r=jsonb_build_array(jsonb_build_object('job_id',j.id,'state',case when p_action='approve' then 'pending' else 'cancelled' end));n=1;
 elsif p_action='disconnect' then
  select * into c from public.vc_linkedin_session_connections where owner_id=p_owner and id=(p->>'connection_id')::uuid for update;
  if not found then raise exception 'Connection not found';end if;
  update public.vc_linkedin_session_connections set state='revoked',session_reference=null,expires_at=null,verification_kind=null,revision=revision+1,updated_at=now() where id=c.id;
  update public.vc_session_jobs set state=case when state='leased' and operation in('send_message','send_invitation','send_email') then 'unknown' else 'cancelled' end,encrypted_input=null,encrypted_result=null,updated_at=now() where connection_id=c.id and state in('draft','pending','leased');
  insert into public.vc_linkedin_session_events(connection_id,owner_id,previous_state,next_state,event_type,actor) values(c.id,p_owner,c.state,'revoked','owner_revocation','owner');
  r=jsonb_build_array(jsonb_build_object('revoked',true));n=1;
 else raise exception 'Invalid broker operation';end if;
 return jsonb_build_object('rows',r,'changes',n);
end $$;
revoke all on function public.vc_session_broker(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_session_broker(text,text,jsonb) to service_role;

create or replace function public.vc_session_worker(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.vc_session_jobs%rowtype; c public.vc_linkedin_session_connections%rowtype; original text; r jsonb:='[]'; st text; n integer:=0;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner';end if;
 delete from public.vc_session_worker_nonces where created_at<now()-interval '5 minutes';
 insert into public.vc_session_worker_nonces(nonce) values((p->>'nonce')::uuid);
 insert into public.vc_session_worker_health(owner_id,last_seen,version) values(p_owner,now(),left(coalesce(p->>'version','unknown'),80))
 on conflict(owner_id) do update set last_seen=now(),version=excluded.version;
 update public.vc_linkedin_session_connections set state='expired',session_reference=null,verification_kind=null,revision=revision+1,updated_at=now()
 where owner_id=p_owner and state in('connected','verification_required') and expires_at<=now();
 -- At-most-once jobs never get automatically reclaimed, including login/OTP.
 update public.vc_session_jobs set state=case when state='leased' and operation in('send_message','send_invitation','send_email') then 'unknown' else 'failed' end,
  encrypted_input=null,error_code='JOB_EXPIRED',updated_at=now()
 where owner_id=p_owner and ((state in('pending','draft') and expires_at<=now()) or (state='leased' and lease_until<=now()));
 update public.vc_linkedin_session_connections c0 set state='error',last_error_code='JOB_EXPIRED',revision=revision+1,updated_at=now()
 where c0.owner_id=p_owner and c0.state='awaiting_login' and not exists(select 1 from public.vc_session_jobs j0 where j0.connection_id=c0.id and j0.state in('pending','leased'));
 if p_action='claim' then
  select j0.* into j from public.vc_session_jobs j0
  join public.vc_linkedin_session_connections c0 on c0.id=j0.connection_id and c0.owner_id=j0.owner_id and c0.revision=j0.connection_revision and c0.state<>'revoked'
  where j0.owner_id=p_owner and j0.state='pending' and j0.expires_at>now()
  order by j0.created_at for update of j0 skip locked limit 1;
  if found then
   original=j.encrypted_input;
   update public.vc_session_jobs set state='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '150 seconds',encrypted_input=null,updated_at=now() where id=j.id returning * into j;
   r=jsonb_build_array(jsonb_build_object('id',j.id,'owner_id',j.owner_id,'connection_id',j.connection_id,'operation',j.operation,'encrypted_input',original,'lease_token',j.lease_token));n=1;
  end if;
 elsif p_action='finish' then
  select * into j from public.vc_session_jobs where owner_id=p_owner and id=(p->>'id')::uuid and state='leased' and lease_token=(p->>'lease_token')::uuid and lease_until>now() for update;
  if found then
   select * into c from public.vc_linkedin_session_connections where owner_id=p_owner and id=j.connection_id and revision=j.connection_revision and state<>'revoked' for update;
   if found then
    st=case when (p->>'ok')::boolean then 'succeeded' when j.operation in('send_message','send_invitation','send_email') then 'unknown' else 'failed' end;
    update public.vc_session_jobs set state=st,encrypted_result=p->>'encrypted_result',error_code=p->>'error_code',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
    if j.operation in('connect','import','connect_mail','verify','refresh') then
     if p->>'connection_state'='connected' and length(coalesce(p->>'reference',''))>=32 and length(coalesce(p->>'profile_id',''))>0
       and (p->>'expires_at')::timestamptz>now() and (p->>'expires_at')::timestamptz<=now()+interval '24 hours 1 minute' then
      update public.vc_linkedin_session_connections set state='connected',session_reference=p->>'reference',profile_id=p->>'profile_id',expires_at=(p->>'expires_at')::timestamptz,last_verified_at=now(),verification_kind=null,last_error_code=null,revision=revision+1,updated_at=now() where id=c.id;
     elsif p->>'connection_state'='verification_required' and p->>'verification_kind' in('email','totp','push','captcha','other') then
      update public.vc_linkedin_session_connections set state='verification_required',verification_kind=p->>'verification_kind',expires_at=now()+interval '10 minutes',last_error_code=null,revision=revision+1,updated_at=now() where id=c.id;
     else update public.vc_linkedin_session_connections set state='error',last_error_code=coalesce(p->>'error_code','LOGIN_FAILED'),session_reference=null,revision=revision+1,updated_at=now() where id=c.id;end if;
    elsif p->>'error_code' in('SESSION_EXPIRED','AUTH_REQUIRED','MAIL_AUTH_FAILED') then
     update public.vc_linkedin_session_connections set state='expired',session_reference=null,last_error_code=p->>'error_code',revision=revision+1,updated_at=now() where id=c.id;
    end if;
    insert into public.vc_activity(id,owner,operation,account_id,status,error_code,duration_ms,created_at)
    values(gen_random_uuid()::text,p_owner,'session.'||j.operation,c.id::text,st,p->>'error_code',greatest(0,extract(epoch from (now()-j.updated_at))*1000)::integer,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    insert into public.vc_linkedin_session_events(connection_id,owner_id,next_state,event_type,actor) values(c.id,p_owner,c.state,'job_'||st||':'||j.operation,'worker');n=1;
   end if;
  end if;
 else raise exception 'Invalid worker action';end if;
 return jsonb_build_object('rows',r,'changes',n,'connections',coalesce((select jsonb_agg(id) from public.vc_linkedin_session_connections where owner_id=p_owner and state in('connected','awaiting_login','verification_required')),'[]'));
end $$;
revoke all on function public.vc_session_worker(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_session_worker(text,text,jsonb) to service_role;
