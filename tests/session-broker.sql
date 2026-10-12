\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
\ir ../supabase/migrations/20261012070000_linkedin_session_foundation.sql
\ir ../supabase/migrations/20261012080000_session_management.sql
\ir ../supabase/migrations/20261012090000_session_broker_jobs.sql
begin;
set local role service_role;
do $$
declare c uuid; jid uuid:=gen_random_uuid(); lease uuid; r jsonb; nonce uuid:=gen_random_uuid(); blocked boolean; draft uuid:=gen_random_uuid();
begin
 c=(public.vc_session_manage('create','owner-a','{"label":"test"}')->'rows'->0->>'id')::uuid;
 blocked=false;begin perform public.vc_session_broker('enqueue','owner-b',jsonb_build_object('connection_id',c,'id',jid,'operation','connect'));exception when others then blocked=true;end;
 assert blocked,'cross-owner enqueue allowed';
 perform public.vc_session_broker('enqueue','owner-a',jsonb_build_object('connection_id',c,'id',jid,'operation','connect','encrypted_input','encrypted-fixture','content_hash',repeat('a',64)));
 r=public.vc_session_worker('claim','owner-b',jsonb_build_object('nonce',gen_random_uuid()));assert jsonb_array_length(r->'rows')=0,'cross-owner claim';
 r=public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',nonce));lease=(r->'rows'->0->>'lease_token')::uuid;
 assert r->'rows'->0->>'encrypted_input'='encrypted-fixture','claim missing credentials';
 assert (select encrypted_input is null from public.vc_session_jobs where id=jid),'claimed credentials persisted';
 blocked=false;begin perform public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',nonce));exception when unique_violation then blocked=true;end;assert blocked,'nonce replay accepted';
 r=public.vc_session_worker('finish','owner-a',jsonb_build_object('nonce',gen_random_uuid(),'id',jid,'lease_token',gen_random_uuid(),'ok',true));assert (r->>'changes')::int=0,'wrong lease accepted';
 r=public.vc_session_worker('finish','owner-a',jsonb_build_object('nonce',gen_random_uuid(),'id',jid,'lease_token',lease,'ok',true,'connection_state','connected','reference',repeat('f',64),'profile_id','test-member','expires_at',now()+interval '1 hour','encrypted_result','cipher'));
 assert (r->>'changes')::int=1,'valid completion rejected';
 assert (select state='connected' from public.vc_linkedin_session_connections where id=c),'not connected';
 r=public.vc_session_broker('job','owner-b',jsonb_build_object('id',jid));assert jsonb_array_length(r->'rows')=0,'cross-owner result';
 perform public.vc_session_broker('enqueue','owner-a',jsonb_build_object('connection_id',c,'id',draft,'operation','send_message','encrypted_input','cipher','public_input','{"conversation_id":"test","content":"hi"}'::jsonb,'content_hash',repeat('b',64)));
 r=public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',gen_random_uuid()));assert jsonb_array_length(r->'rows')=0,'unapproved draft claimed';
 blocked=false;begin perform public.vc_session_broker('approve','owner-a',jsonb_build_object('id',draft,'content_hash',repeat('c',64)));exception when others then blocked=true;end;assert blocked,'wrong approval hash';
 blocked=false;begin perform public.vc_session_broker('approve','owner-a',jsonb_build_object('id',draft));exception when others then blocked=true;end;assert blocked,'missing approval hash';
 perform public.vc_session_broker('approve','owner-a',jsonb_build_object('id',draft,'content_hash',repeat('b',64)));
 blocked=false;begin perform public.vc_session_broker('approve','owner-a',jsonb_build_object('id',draft,'content_hash',repeat('b',64)));exception when others then blocked=true;end;assert blocked,'approval reused';
 r=public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',gen_random_uuid()));assert (r->'rows'->0->>'id')::uuid=draft,'approved draft not claimed';
 update public.vc_session_jobs set lease_until=now()-interval '1 second' where id=draft;
 r=public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',gen_random_uuid()));assert jsonb_array_length(r->'rows')=0,'uncertain send requeued';
 assert (select state='unknown' from public.vc_session_jobs where id=draft),'uncertain send not preserved';
 r=public.vc_session_broker('enqueue','owner-a',jsonb_build_object('connection_id',c,'id',gen_random_uuid(),'operation','send_message','encrypted_input','cipher','content_hash',repeat('b',64)));
 assert (r->'rows'->0->>'job_id')::uuid=draft,'uncertain duplicate accepted';
 perform public.vc_session_broker('disconnect','owner-a',jsonb_build_object('connection_id',c));
 r=public.vc_session_worker('claim','owner-a',jsonb_build_object('nonce',gen_random_uuid()));assert jsonb_array_length(r->'connections')=0,'revoked session remains active';
 assert not has_function_privilege('anon','public.vc_session_worker(text,text,jsonb)','execute'),'anon worker permission';
 assert not has_table_privilege('authenticated','public.vc_session_jobs','select'),'authenticated credential table access';
 raise notice 'PASS ownership, secret erasure, replay, lease, approval, dedupe and revocation';
end $$;
rollback;
