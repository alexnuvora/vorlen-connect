-- Direct LinkedIn review state is isolated from legacy drafts and never contains OAuth tokens.
create table public.vc_linkedin_post_reviews (
 draft_id text primary key references public.vc_drafts(id) on delete cascade,
 owner text not null,
 revision integer not null default 1,
 content_hash text not null,
 review_state text not null default 'pending' check (review_state in ('pending','approved','scheduled','publishing','published','unknown','rejected')),
 approved_revision integer,
 approved_hash text,
 scheduled_at timestamptz,
 attempt_key text,
 published_at timestamptz,
 post_id text,
 post_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index vc_li_reviews_owner_state on public.vc_linkedin_post_reviews(owner,review_state,scheduled_at);
alter table public.vc_linkedin_post_reviews enable row level security;
revoke all on public.vc_linkedin_post_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.vc_linkedin_post_reviews to service_role;
create table public.vc_linkedin_post_audit (
 id bigint generated always as identity primary key,
 owner text not null, draft_id text not null, action text not null,
 revision integer not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.vc_linkedin_post_audit enable row level security;
revoke all on public.vc_linkedin_post_audit from public,anon,authenticated;
grant select,insert on public.vc_linkedin_post_audit to service_role;

-- All mutations use a transaction-scoped lock, compare-and-swap revision checks,
-- and a permanent publishing claim before external calls (uncertain results never retried).
create function public.vc_linkedin_post_control(p_action text,p_owner text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 d public.vc_drafts%rowtype;
 s public.vc_linkedin_post_reviews%rowtype;
 v_id text:=p->>'draft_id';
 v_now timestamptz:=clock_timestamp();
 v_revision integer;
 v_hash text;
 v_rows jsonb:='[]'::jsonb;
 v_changes integer:=0;
begin
 if p_owner is null or length(p_owner) not between 1 and 300 then raise exception 'Invalid owner'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_rows from (
   select d.id,d.payload,d.status,s.revision,s.review_state,s.scheduled_at,s.post_url,s.post_id,s.approved_hash
   from public.vc_drafts d left join public.vc_linkedin_post_reviews s on s.draft_id=d.id and s.owner=p_owner
   where d.owner=p_owner and d.operation='linkedin.create_post' and d.status='pending'
   and coalesce(s.review_state,'pending') in ('pending','approved','scheduled')
   order by d.created_at desc limit 100
  ) t;
  return jsonb_build_object('rows',v_rows,'changes',0);
 end if;
 if p_action='due' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_rows from (
   select draft_id from public.vc_linkedin_post_reviews where owner=p_owner and review_state='scheduled'
   and scheduled_at<=v_now order by scheduled_at limit 25
  ) t;
  return jsonb_build_object('rows',v_rows,'changes',0);
 end if;
 if v_id is null then raise exception 'Missing draft_id'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vc_li_post:'||p_owner||':'||v_id,0));
 select * into d from public.vc_drafts where id=v_id and owner=p_owner and operation='linkedin.create_post' for update;
 if not found then return jsonb_build_object('rows',v_rows,'changes',0);end if;
 insert into public.vc_linkedin_post_reviews(draft_id,owner,content_hash)
 values(v_id,p_owner,encode(extensions.digest(d.payload,'sha256'),'hex'))
 on conflict(draft_id) do nothing;
 select * into s from public.vc_linkedin_post_reviews where draft_id=v_id and owner=p_owner for update;
 v_revision=coalesce((p->>'revision')::integer,0);
 if p_action='get' then
  v_rows=jsonb_build_array(jsonb_build_object('draft_id',d.id,'payload',d.payload,'status',d.status,'revision',s.revision,'review_state',s.review_state,'content_hash',s.content_hash,'approved_hash',s.approved_hash,'scheduled_at',s.scheduled_at,'post_id',s.post_id,'post_url',s.post_url));
  return jsonb_build_object('rows',v_rows,'changes',0);
 end if;
 if d.status<>'pending' or s.revision<>v_revision then return jsonb_build_object('rows',v_rows,'changes',0); end if;
 if p_action='edit' and s.review_state in ('pending','approved','scheduled') and jsonb_typeof(p->'payload')='object' then
  -- The payload is strictly validated by server-side zod before entering SQL.
  update public.vc_drafts set payload=(p->'payload')::text,updated_at=v_now::text where id=v_id and owner=p_owner;
  update public.vc_linkedin_post_reviews set revision=revision+1,content_hash=encode(extensions.digest((p->'payload')::text,'sha256'),'hex'),review_state='pending',approved_revision=null,approved_hash=null,scheduled_at=null,updated_at=v_now where draft_id=v_id;
  v_changes=1;
 elsif p_action='approve' and s.review_state='pending' and s.content_hash=p->>'content_hash' then
  update public.vc_linkedin_post_reviews set review_state='approved',approved_revision=revision,approved_hash=content_hash,updated_at=v_now where draft_id=v_id;
  v_changes=1;
 elsif p_action='reject' and s.review_state in ('pending','approved','scheduled') then
  update public.vc_linkedin_post_reviews set review_state='rejected',approved_revision=null,approved_hash=null,scheduled_at=null,updated_at=v_now where draft_id=v_id;
  v_changes=1;
 elsif p_action='schedule' and s.review_state in ('approved','scheduled') and s.approved_revision=s.revision and s.approved_hash=s.content_hash and (p->>'scheduled_at')::timestamptz>v_now then
  update public.vc_linkedin_post_reviews set review_state='scheduled',scheduled_at=(p->>'scheduled_at')::timestamptz,updated_at=v_now where draft_id=v_id;
  v_changes=1;
 elsif p_action='claim' and s.review_state in ('approved','scheduled') and (s.review_state='approved' or s.scheduled_at<=v_now) and s.approved_revision=s.revision and s.approved_hash=s.content_hash and s.attempt_key is null then
  update public.vc_linkedin_post_reviews set review_state='publishing',attempt_key=p->>'attempt_key',scheduled_at=null,updated_at=v_now where draft_id=v_id;
  v_changes=1;
 elsif p_action='finish' and s.review_state='publishing' and s.attempt_key=p->>'attempt_key' then
  update public.vc_linkedin_post_reviews set review_state=case when p->>'post_id' is not null then 'published' else 'unknown' end,
   post_id=p->>'post_id',post_url=p->>'post_url',published_at=case when p->>'post_id' is not null then v_now else null end,updated_at=v_now where draft_id=v_id;
  if p->>'post_id' is not null then update public.vc_drafts set status='sent',result=jsonb_build_object('acknowledged',true,'post_id',p->>'post_id','post_url',p->>'post_url')::text,updated_at=v_now::text where id=v_id and owner=p_owner;end if;
  v_changes=1;
 end if;
 if v_changes=1 then
   insert into public.vc_linkedin_post_audit(owner,draft_id,action,revision,detail) values(p_owner,v_id,p_action,s.revision,jsonb_build_object('at',v_now));
 end if;
 return jsonb_build_object('rows',v_rows,'changes',v_changes);
end $$;
-- digest requires pgcrypto in extensions schema; installed by Supabase.
revoke all on function public.vc_linkedin_post_control(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vc_linkedin_post_control(text,text,jsonb) to service_role;
