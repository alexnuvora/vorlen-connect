-- Owner-scoped session connection management. No secrets or cookies are accepted.
create or replace function public.vc_session_manage(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb:='[]'::jsonb; n integer:=0; v_id uuid; v_label text;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 then raise exception 'Invalid owner'; end if;
 case p_action
 when 'list' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into r from (
   select id,label,state,verification_kind,profile_id,last_verified_at,expires_at,last_error_code,revision,created_at,updated_at
   from public.vc_linkedin_session_connections
   where owner_id=p_owner order by created_at desc limit 50
  ) t;
 when 'create' then
  v_label=trim(coalesce(p->>'label',''));
  if length(v_label) not between 1 and 100 then raise exception 'Invalid label'; end if;
  insert into public.vc_linkedin_session_connections(owner_id,label) values(p_owner,v_label) returning id into v_id;
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
