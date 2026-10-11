-- Vorlen Connect. All data access is from the trusted application backend.
-- ChatGPT/Sites identities are site-scoped strings, not Supabase Auth UUIDs.
create table public.vc_providers (
 id text primary key, owner text not null, provider text not null check(provider in ('unipile','hunter')),
 base_url text not null, encrypted_key text not null, updated_at text not null, unique(owner,provider)
);
create table public.vc_activity (
 id text primary key, owner text not null, operation text not null, account_id text,
 status text not null, error_code text, duration_ms integer not null, created_at text not null
);
create index vc_activity_owner_date on public.vc_activity(owner,created_at desc);
create table public.vc_drafts (
 id text primary key, owner text not null, operation text not null, payload text not null,
 fingerprint text not null, status text not null check(status in ('pending','sending','sent','unknown','cancelled')),
 result text, created_at text not null, updated_at text not null, unique(owner,fingerprint)
);
create index vc_draft_owner on public.vc_drafts(owner,created_at desc);
create table public.vc_contacts (
 id text primary key, owner text not null, name text not null, kind text not null check(kind in ('person','company','client','candidate')),
 source_url text not null, notes text not null, created_at text not null, unique(owner,source_url)
);
create table public.vc_suppressions (
 id text primary key, owner text not null, recipient text not null, reason text not null,
 created_at text not null, unique(owner,recipient)
);
create table public.vc_rate_buckets (key text primary key, count integer not null, expires_at bigint not null);
create index vc_rate_expiry on public.vc_rate_buckets(expires_at);

alter table public.vc_providers enable row level security;
alter table public.vc_activity enable row level security;
alter table public.vc_drafts enable row level security;
alter table public.vc_contacts enable row level security;
alter table public.vc_suppressions enable row level security;
alter table public.vc_rate_buckets enable row level security;
revoke all on public.vc_providers,public.vc_activity,public.vc_drafts,public.vc_contacts,public.vc_suppressions,public.vc_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.vc_providers,public.vc_activity,public.vc_drafts,public.vc_contacts,public.vc_suppressions,public.vc_rate_buckets to service_role;
-- No anon/authenticated policies: browser roles must not access these tables.
-- The backend owns authorization and supplies its trusted request identity.

create function public.vc_store(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb := '[]'::jsonb; changed integer := 0; n integer;
begin
 if p_owner is null or length(p_owner)<1 or length(p_owner)>300 then raise exception 'Invalid owner'; end if;
 case p_action
 when 'provider_get' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_providers where owner=p_owner and provider=p->>'provider') t;
 when 'provider_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select provider,base_url,updated_at from public.vc_providers where owner=p_owner) t;
 when 'provider_upsert' then
  insert into public.vc_providers(id,owner,provider,base_url,encrypted_key,updated_at) values(p->>'id',p_owner,p->>'provider',p->>'base_url',p->>'encrypted_key',p->>'updated_at')
  on conflict(owner,provider) do update set base_url=excluded.base_url,encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at;
  get diagnostics changed=row_count;
 when 'provider_delete' then
  delete from public.vc_providers where owner=p_owner and provider=p->>'provider'; get diagnostics changed=row_count;
 when 'rate_increment' then
  if left(p->>'key',length(p_owner)+1)<>p_owner||':' then raise exception 'Invalid rate owner'; end if;
  insert into public.vc_rate_buckets(key,count,expires_at) values(p->>'key',1,(p->>'expires_at')::bigint)
  on conflict(key) do update set count=public.vc_rate_buckets.count+1 returning count into n;
  rows=jsonb_build_array(jsonb_build_object('count',n));changed=1;
 when 'rate_cleanup' then
  delete from public.vc_rate_buckets where expires_at<(p->>'timestamp')::bigint and left(key,length(p_owner)+1)=p_owner||':';get diagnostics changed=row_count;
 when 'activity_insert' then
  insert into public.vc_activity values(p->>'id',p_owner,p->>'operation',p->>'account_id',p->>'status',p->>'error_code',(p->>'duration_ms')::integer,p->>'created_at');get diagnostics changed=row_count;
 when 'activity_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (
   select * from public.vc_activity where owner=p_owner
   and (not p?'account_id' or account_id=p->>'account_id')
   and (not p?'operation' or operation=p->>'operation')
   and (not p?'status' or status=p->>'status')
   order by created_at desc limit least(200,greatest(1,coalesce((p->>'limit')::integer,50))) offset greatest(0,coalesce((p->>'offset')::integer,0))
  ) t;
 when 'usage' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (
   select operation,account_id,status,count(*)::integer as calls from public.vc_activity where owner=p_owner
   and (not p?'account_id' or account_id=p->>'account_id')
   and (not p?'date_from' or created_at>=p->>'date_from')
   and (not p?'date_to' or created_at<=p->>'date_to')
   group by operation,account_id,status
  ) t;
 when 'contact_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_contacts where owner=p_owner order by created_at desc limit 100) t;
 when 'contact_upsert' then
  insert into public.vc_contacts values(p->>'id',p_owner,p->>'name',p->>'kind',p->>'source_url',p->>'notes',p->>'created_at')
  on conflict(owner,source_url) do update set name=excluded.name,kind=excluded.kind,notes=excluded.notes;get diagnostics changed=row_count;
 when 'contact_delete' then
  delete from public.vc_contacts where owner=p_owner and id=p->>'id';get diagnostics changed=row_count;
 when 'draft_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_drafts where owner=p_owner order by created_at desc limit 100) t;
 when 'draft_insert' then
  insert into public.vc_drafts values(p->>'id',p_owner,p->>'operation',p->>'payload',p->>'fingerprint','pending',null,p->>'created_at',p->>'updated_at') on conflict(owner,fingerprint) do nothing;get diagnostics changed=row_count;
 when 'draft_fingerprint' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_drafts where owner=p_owner and fingerprint=p->>'fingerprint') t;
 when 'draft_get' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_drafts where owner=p_owner and id=p->>'id') t;
 when 'draft_claim' then
  update public.vc_drafts set status='sending',updated_at=p->>'updated_at' where owner=p_owner and id=p->>'id' and status='pending';get diagnostics changed=row_count;
 when 'draft_result' then
  if p->>'status' not in ('sent','unknown') then raise exception 'Invalid completion status';end if;
  update public.vc_drafts set status=p->>'status',result=p->>'result',updated_at=p->>'updated_at' where owner=p_owner and id=p->>'id' and status='sending';get diagnostics changed=row_count;
 when 'draft_cancel' then
  update public.vc_drafts set status='cancelled',updated_at=p->>'updated_at' where owner=p_owner and id=p->>'id' and status='pending';get diagnostics changed=row_count;
 when 'suppression_list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select * from public.vc_suppressions where owner=p_owner order by created_at desc limit 100) t;
 when 'suppression_get' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from (select id from public.vc_suppressions where owner=p_owner and recipient=p->>'recipient') t;
 when 'suppression_upsert' then
  insert into public.vc_suppressions values(p->>'id',p_owner,p->>'recipient',p->>'reason',p->>'created_at') on conflict(owner,recipient) do update set reason=excluded.reason;get diagnostics changed=row_count;
 else raise exception 'Unsupported store action';
 end case;
 return jsonb_build_object('rows',rows,'changes',changed);
end;
$$;
revoke all on function public.vc_store(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_store(text,text,jsonb) to service_role;
comment on function public.vc_store(text,text,jsonb) is 'Vorlen Connect server-only parameterised repository. Never expose the service role key to a client. Site identity is authorized by the backend.';
