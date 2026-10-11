-- Transactional checks on the real database; all synthetic data is rolled back.
begin;
do $$
declare r jsonb; n integer;
begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vc_linkedin_apps','vc_linkedin_accounts','vc_linkedin_states') and not c.relrowsecurity) then raise exception 'RLS missing'; end if;
 if has_function_privilege('anon','public.vc_linkedin_store(text,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.vc_linkedin_store(text,text,jsonb)','EXECUTE') then raise exception 'Browser RPC access'; end if;
 if has_table_privilege('anon','public.vc_linkedin_accounts','SELECT') or has_table_privilege('authenticated','public.vc_linkedin_apps','SELECT') then raise exception 'Browser table access'; end if;
 perform public.vc_linkedin_store('linkedin_config_save','vc-test-direct-alice','{"client_id":"test-client","encrypted_secret":"ciphertext","revision":"r1"}');
 perform public.vc_linkedin_store('linkedin_state_create','vc-test-direct-alice','{"state_hash":"s","binding_hash":"b","revision":"r1"}');
 r:=public.vc_linkedin_store('linkedin_state_claim','vc-test-direct-bob','{"state_hash":"s","binding_hash":"b"}');if (r->>'changes')::int<>0 then raise exception 'Cross-owner state'; end if;
 r:=public.vc_linkedin_store('linkedin_state_claim','vc-test-direct-alice','{"state_hash":"s","binding_hash":"wrong"}');if (r->>'changes')::int<>0 then raise exception 'Browser binding'; end if;
 r:=public.vc_linkedin_store('linkedin_state_claim','vc-test-direct-alice','{"state_hash":"s","binding_hash":"b"}');if (r->>'changes')::int<>1 then raise exception 'State not claimed'; end if;
 r:=public.vc_linkedin_store('linkedin_state_claim','vc-test-direct-alice','{"state_hash":"s","binding_hash":"b"}');if (r->>'changes')::int<>0 then raise exception 'Replay'; end if;
 perform public.vc_linkedin_store('linkedin_state_create','vc-test-direct-alice','{"state_hash":"s2","binding_hash":"b","revision":"r1"}');
 update public.vc_linkedin_states set expires_at=now()-interval '1 second' where owner='vc-test-direct-alice';
 r:=public.vc_linkedin_store('linkedin_state_claim','vc-test-direct-alice','{"state_hash":"s2","binding_hash":"b"}');if (r->>'changes')::int<>0 then raise exception 'Expired state'; end if;
 r:=public.vc_linkedin_store('linkedin_account_save','vc-test-direct-alice','{"id":"test-account","subject":"test-member","name":"Synthetic","encrypted_token":"token-ciphertext","expires_at":"2030-01-01T00:00:00Z","scopes":["openid","profile","w_member_social"],"revision":"r1"}');if (r->>'changes')::int<>1 then raise exception 'Account save'; end if;
 r:=public.vc_linkedin_store('linkedin_account_get','vc-test-direct-bob','{"id":"test-account"}');if jsonb_array_length(r->'rows')<>0 then raise exception 'Cross-owner account'; end if;
 r:=public.vc_linkedin_store('linkedin_account_list','vc-test-direct-alice');if (r->'rows'->0)?'encrypted_token' then raise exception 'Leaked token'; end if;
 perform public.vc_linkedin_store('linkedin_config_save','vc-test-direct-alice','{"client_id":"new-client","encrypted_secret":"ciphertext","revision":"r2"}');
 r:=public.vc_linkedin_store('linkedin_account_list','vc-test-direct-alice');if jsonb_array_length(r->'rows')<>0 then raise exception 'Old account retained'; end if;
 r:=public.vc_linkedin_store('linkedin_account_save','vc-test-direct-alice','{"id":"test-account","subject":"test-member","name":"Synthetic","encrypted_token":"ciphertext","expires_at":"2030-01-01T00:00:00Z","scopes":[],"revision":"r1"}');if (r->>'changes')::int<>0 then raise exception 'Stale OAuth saved'; end if;
end $$;
select 'All direct LinkedIn database checks passed; synthetic records rolled back' as result;
rollback;
