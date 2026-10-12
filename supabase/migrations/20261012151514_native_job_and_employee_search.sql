-- Expand the allowlist for read-only native research jobs.
alter table public.vc_session_jobs drop constraint vc_session_jobs_operation_check;
alter table public.vc_session_jobs add constraint vc_session_jobs_operation_check check(operation in ('connect','import','verify','refresh','profile','inbox','conversation','invitations','connections','search_people','recruiter','send_message','send_invitation','disconnect','contact','company','search_companies','sent_invitations','network_status','feed','post_comments','emails','connect_mail','send_email','employees','search_jobs'));
