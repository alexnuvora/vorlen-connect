-- OAuth 2.1 public clients for the owner-authorized Vorlen Connect MCP endpoint.
create table public.vc_oauth_clients (
 client_id text primary key,
 client_name text not null,
 redirect_uris jsonb not null,
 created_at timestamptz not null default now()
);
create table public.vc_oauth_grants (
 secret_hash text primary key,
 kind text not null check (kind in ('code','access','refresh')),
 client_id text not null references public.vc_oauth_clients(client_id),
 owner text not null,
 redirect_uri text,
 pkce_challenge text,
 resource text not null,
 scope text not null default 'mcp',
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index vc_oauth_grants_owner_client on public.vc_oauth_grants(owner,client_id,kind,expires_at);
alter table public.vc_oauth_clients enable row level security;
alter table public.vc_oauth_grants enable row level security;
revoke all on public.vc_oauth_clients,public.vc_oauth_grants from public,anon,authenticated;
grant select,insert,update,delete on public.vc_oauth_clients,public.vc_oauth_grants to service_role;
create function public.vc_oauth_control(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r jsonb:='[]'::jsonb;
  n integer:=0;
  g public.vc_oauth_grants%rowtype;
begin
 if p_owner is null or p_owner='' then raise exception 'Owner required'; end if;
 case p_action
 when 'register' then
  insert into public.vc_oauth_clients(client_id,client_name,redirect_uris)
  values(p->>'client_id',left(p->>'client_name',160),p->'redirect_uris')
  on conflict do nothing;
  get diagnostics n=row_count;
 when 'client' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into r from (
   select client_id,client_name,redirect_uris from public.vc_oauth_clients where client_id=p->>'client_id'
  ) t;
 when 'issue_code' then
  if not exists (select 1 from public.vc_oauth_clients where client_id=p->>'client_id' and redirect_uris ? (p->>'redirect_uri')) then
   raise exception 'Unregistered OAuth redirect';
  end if;
  insert into public.vc_oauth_grants(secret_hash,kind,client_id,owner,redirect_uri,pkce_challenge,resource,scope,expires_at)
  values(p->>'secret_hash','code',p->>'client_id',p_owner,p->>'redirect_uri',p->>'pkce_challenge',p->>'resource','mcp',now()+interval '5 minutes');
  n=1;
 when 'exchange' then
  select * into g from public.vc_oauth_grants where secret_hash=p->>'secret_hash' and kind='code' and owner=p_owner for update;
  if found and g.consumed_at is null and g.expires_at>now()
    and g.client_id=p->>'client_id' and g.redirect_uri=p->>'redirect_uri'
    and g.resource=p->>'resource' and g.pkce_challenge=p->>'pkce_challenge' then
   update public.vc_oauth_grants set consumed_at=now() where secret_hash=g.secret_hash;
   insert into public.vc_oauth_grants(secret_hash,kind,client_id,owner,resource,scope,expires_at)
   values(p->>'access_hash','access',g.client_id,p_owner,g.resource,'mcp',now()+interval '60 minutes');
   insert into public.vc_oauth_grants(secret_hash,kind,client_id,owner,resource,scope,expires_at)
   values(p->>'refresh_hash','refresh',g.client_id,p_owner,g.resource,'mcp',now()+interval '30 days');
   n=1;
  end if;
 when 'refresh' then
  select * into g from public.vc_oauth_grants where secret_hash=p->>'secret_hash' and kind='refresh' and owner=p_owner for update;
  if found and g.consumed_at is null and g.expires_at>now() and g.client_id=p->>'client_id' and g.resource=p->>'resource' then
   update public.vc_oauth_grants set consumed_at=now() where secret_hash=g.secret_hash;
   insert into public.vc_oauth_grants(secret_hash,kind,client_id,owner,resource,scope,expires_at)
   values(p->>'access_hash','access',g.client_id,p_owner,g.resource,'mcp',now()+interval '60 minutes');
   insert into public.vc_oauth_grants(secret_hash,kind,client_id,owner,resource,scope,expires_at)
   values(p->>'refresh_hash','refresh',g.client_id,p_owner,g.resource,'mcp',now()+interval '30 days');
   n=1;
  end if;
 when 'verify' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into r from (
   select owner,client_id,scope from public.vc_oauth_grants
   where secret_hash=p->>'secret_hash' and kind='access' and owner=p_owner
   and resource=p->>'resource' and consumed_at is null and expires_at>now()
  ) t;
 when 'revoke' then
  update public.vc_oauth_grants set consumed_at=now() where secret_hash=p->>'secret_hash' and owner=p_owner and consumed_at is null;
  get diagnostics n=row_count;
 else raise exception 'Unsupported OAuth action';
 end case;
 return jsonb_build_object('rows',r,'changes',n);
end $$;
revoke all on function public.vc_oauth_control(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_oauth_control(text,text,jsonb) to service_role;
