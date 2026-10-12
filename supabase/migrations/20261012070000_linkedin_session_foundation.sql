-- LinkedIn session integration lifecycle. No passwords, OTPs, or cookie material
-- are persisted by this schema. All operations are server-side service_role only.
create table if not exists public.vc_linkedin_session_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id text not null check (length(owner_id) between 1 and 300),
 label text not null check(length(label) between 1 and 100),
 state text not null default 'disconnected' check (state in ('disconnected','awaiting_login','verification_required','connected','expired','revoked','error')),
 verification_kind text check(verification_kind in ('email','totp','push','captcha','other')),
 session_reference text, -- opaque reference; future vault adapter required
 profile_id text,
 last_verified_at timestamptz,
 expires_at timestamptz,
 last_error_code text,
 revision bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint verified_state_requires_verification check (state <> 'connected' or (last_verified_at is not null and session_reference is not null))
);
create index if not exists vc_li_session_owner on public.vc_linkedin_session_connections(owner_id,created_at desc);
create table if not exists public.vc_linkedin_session_events (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.vc_linkedin_session_connections(id) on delete cascade,
 owner_id text not null,
 previous_state text,
 next_state text not null,
 event_type text not null,
 actor text not null,
 happened_at timestamptz not null default now()
);
create index if not exists vc_li_session_events_lookup on public.vc_linkedin_session_events(owner_id,connection_id,happened_at desc);
alter table public.vc_linkedin_session_connections enable row level security;
alter table public.vc_linkedin_session_events enable row level security;
revoke all on public.vc_linkedin_session_connections, public.vc_linkedin_session_events from public,anon,authenticated;
grant select,insert,update,delete on public.vc_linkedin_session_connections to service_role;
grant select,insert on public.vc_linkedin_session_events to service_role;

create or replace function public.vc_session_transition(
 p_owner text,p_id uuid,p_expected bigint,p_next text,p_actor text,
 p_verification_kind text default null,p_session_reference text default null,
 p_profile_id text default null,p_expires_at timestamptz default null,
 p_error_code text default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare prev public.vc_linkedin_session_connections%rowtype;
begin
 if length(coalesce(p_owner,'')) not between 1 and 300 or length(coalesce(p_actor,'')) not between 1 and 100 then raise exception 'Invalid owner or actor'; end if;
 select * into prev from public.vc_linkedin_session_connections
 where owner_id=p_owner and id=p_id and revision=p_expected for update;
 if not found then return false; end if;
 if not (
  (prev.state='disconnected' and p_next in('awaiting_login','revoked')) or
  (prev.state='awaiting_login' and p_next in('verification_required','connected','error','revoked')) or
  (prev.state='verification_required' and p_next in('awaiting_login','connected','error','revoked')) or
  (prev.state='connected' and p_next in('expired','revoked','error')) or
  (prev.state='expired' and p_next in('awaiting_login','revoked')) or
  (prev.state='error' and p_next in('awaiting_login','revoked'))
 ) then raise exception 'Invalid session state transition'; end if;
 if p_next='connected' and (nullif(p_session_reference,'') is null or nullif(p_profile_id,'') is null or p_expires_at is null or p_expires_at <= now()) then raise exception 'Verified session evidence required'; end if;
 if p_next='verification_required' and p_verification_kind not in ('email','totp','push','captcha','other') then raise exception 'Verification kind required'; end if;
 update public.vc_linkedin_session_connections
 set state=p_next,revision=revision+1,updated_at=now(),
     verification_kind=case when p_next='verification_required' then p_verification_kind else null end,
     session_reference=case when p_next='connected' then p_session_reference else null end,
     profile_id=case when p_next='connected' then p_profile_id else null end,
     last_verified_at=case when p_next='connected' then now() else null end,
     expires_at=case when p_next='connected' then p_expires_at else null end,
     last_error_code=case when p_next='error' then left(coalesce(p_error_code,'unknown'),100) else null end
 where owner_id=p_owner and id=p_id;
 insert into public.vc_linkedin_session_events(connection_id,owner_id,previous_state,next_state,event_type,actor)
 values (p_id,p_owner,prev.state,p_next,'transition',p_actor);
 return true;
end $$;
revoke all on function public.vc_session_transition(text,uuid,bigint,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.vc_session_transition(text,uuid,bigint,text,text,text,text,text,timestamptz,text) to service_role;
