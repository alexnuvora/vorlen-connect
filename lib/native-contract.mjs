// Native compatibility map. Coverage is separate from live verification.
import {operations} from './catalog.mjs';
export const nativeMap={
 'profiles.get_me':'profile','profiles.get':'profile','profiles.get_contact':'contact',
 'profiles.search_people':'search_people','profiles.search_companies':'search_companies','profiles.get_company':'company',
 'network.list_connections':'connections','network.list_invitations':'invitations','network.list_sent':'sent_invitations',
 'network.check_invitation':'network_status','messages.list':'inbox','conversation.get':'conversation',
 'content.get_feed':'feed','content.get_comments':'post_comments',
 'send_connection.send':'send_invitation','send_message.send':'send_message',
 'emails.list':'emails','send_email.send':'send_email',
};
const local=['accounts.list','account.get','credits.get','logs.list','usage.get'];
const limitations={
 'profiles.search_people':'Keyword, first/last name, title, company, school, geography, industry and network filters; entity filters require LinkedIn numeric IDs. Maximum 25 results per job.',
 'profiles.search_companies':'Keyword, geography, sector and size filters; geography/sector require LinkedIn numeric IDs. Maximum 25 results per job.',
 'messages.list':'INBOX and UNREAD only. Other categories require a verified provider adapter.',
 'send_message.send':'Text, existing conversations or profile recipients. Attachments still require a verified upload adapter.',
 'send_connection.send':'Invitation note limited to 200 characters until account-specific limits are verified.',
 'emails.list':'TLS IMAP inbox using app passwords; OAuth-only mailboxes require a separate OAuth integration.',
 'send_email.send':'TLS SMTP, text/HTML and Reply-To. App-password authentication; no provider OAuth yet.',
 'network.check_invitation':'Returns explicit provider relationship state; never infers no invitation from an empty list.',
 'credits.get':'No Vorlen credits or paid auto-purchases; reports the native free-only operating policy.',
};
export function nativeCoverage(){return operations.map(o=>({...o,provider:'vorlen_native',implementation:nativeMap[o.id]?'adapter':local.includes(o.id)?'implemented':'blocked',live_verified:false,limitation:limitations[o.id]||(nativeMap[o.id]?'Requires live account verification; bounded pagination.':local.includes(o.id)?null:'Native adapter and live provider fixtures still required. No paid-provider fallback.')}));}
export const nativeOperationIds=new Set(operations.map(o=>o.id));
