-- Backend-only direct connector. The trusted Sites owner is never supplied by a browser.
create table public.vc_linkedin_apps (
 owner text primary key, client_id text not null, encrypted_secret text not null,
 revision text not null, updated_at timestamptz not null default now()
);
create table public.vc_linkedin_states (
 owner text not null references public.vc_linkedin_apps(owner) on delete cascade,
 state_hash text not null, binding_hash text not null, revision text not null,
 expires_at timestamptz not null, primary key(owner,state_hash)
);
create table public.vc_linkedin_accounts (
 id text primary key, owner text not null references public.vc_linkedin_apps(owner) on delete cascade,
 subject text not null, name text not null, encrypted_token text not null,
 expires_at timestamptz not null, scopes jsonb not null, unique(owner,subject)
);
alter table public.vc_linkedin_apps enable row level security;
alter table public.vc_linkedin_states enable row level security;
alter table public.vc_linkedin_accounts enable row level security;
revoke all on public.vc_linkedin_apps,public.vc_linkedin_states,public.vc_linkedin_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.vc_linkedin_apps,public.vc_linkedin_states,public.vc_linkedin_accounts to service_role;
create function public.vc_linkedin_store(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb := '[]'::jsonb; changed integer := 0;
begin
 if p_owner is null or length(p_owner)<1 or length(p_owner)>300 then raise exception 'Invalid owner'; end if;
 -- Serializes configuration changes with OAuth completion for this owner only.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vc_linkedin:'||p_owner,0));
 case p_action
 when 'linkedin_config_status' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select client_id,updated_at from public.vc_linkedin_apps where owner=p_owner) t;
 when 'linkedin_config_get' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_linkedin_apps where owner=p_owner) t;
 when 'linkedin_config_save' then
  insert into public.vc_linkedin_apps(owner,client_id,encrypted_secret,revision) values(p_owner,p->>'client_id',p->>'encrypted_secret',p->>'revision')
  on conflict(owner) do update set client_id=excluded.client_id,encrypted_secret=excluded.encrypted_secret,revision=excluded.revision,updated_at=now();
  delete from public.vc_linkedin_states where owner=p_owner;
  delete from public.vc_linkedin_accounts where owner=p_owner;changed=1;
 when 'linkedin_state_create' then
  delete from public.vc_linkedin_states where owner=p_owner;
  insert into public.vc_linkedin_states(owner,state_hash,binding_hash,revision,expires_at)
  select p_owner,p->>'state_hash',p->>'binding_hash',revision,now()+interval '10 minutes' from public.vc_linkedin_apps where owner=p_owner and revision=p->>'revision';
  get diagnostics changed=row_count;
 when 'linkedin_state_claim' then
  with claimed as (delete from public.vc_linkedin_states where owner=p_owner and state_hash=p->>'state_hash' and binding_hash=p->>'binding_hash' and expires_at>now() returning revision)
  select coalesce(jsonb_agg(claimed),'[]'::jsonb) into rows from claimed;
  changed=jsonb_array_length(rows);
 when 'linkedin_account_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select id,subject,name,expires_at,scopes from public.vc_linkedin_accounts where owner=p_owner) t;
 when 'linkedin_account_get' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_linkedin_accounts where owner=p_owner and id=p->>'id') t;
 when 'linkedin_account_save' then
  if exists(select 1 from public.vc_linkedin_apps where owner=p_owner and revision=p->>'revision') then
   delete from public.vc_linkedin_accounts where owner=p_owner and subject=p->>'subject';
   insert into public.vc_linkedin_accounts(id,owner,subject,name,encrypted_token,expires_at,scopes) values(p->>'id',p_owner,p->>'subject',p->>'name',p->>'encrypted_token',(p->>'expires_at')::timestamptz,p->'scopes');changed=1;
  end if;
 when 'linkedin_account_delete' then
  delete from public.vc_linkedin_accounts where owner=p_owner and id=p->>'id';get diagnostics changed=row_count;
 else raise exception 'Unsupported direct connector operation';
 end case;
 return jsonb_build_object('rows',rows,'changes',changed);
end $$;
revoke all on function public.vc_linkedin_store(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_linkedin_store(text,text,jsonb) to service_role;
