const groups = [
 ['profiles','channel_get_profile','Profiles & companies',['get_me','get','get_contact','search_people','search_companies','get_company','get_candidates','get_viewers','get_reactions','get_comments']],
 ['network','channel_list_network','Connections',['list_connections','list_invitations','list_sent','check_invitation','recommendations']],
 ['recruiter','channel_recruiter_read','Recruiter',['get_posts','get_candidates','get_cv']],
 ['content','channel_search_content','Content & engagement',['search','get_feed','get_comments','get_reactions']],
 ['enrich','enrich','Enrichment',['enrich_person','enrich_company','find_email','validate_email','reverse_email','search_jobs','extract_employees']],
 ['messages','channel_list_messages','Messaging',['list']],['conversation','channel_get_conversation','Messaging',['get']],
 ['emails','channel_get_emails','Email',['list']],['send_connection','channel_send_connection','Outreach',['send']],
 ['send_message','channel_send_message','Outreach',['send']],['send_email','channel_send_email','Outreach',['send']],
 ['accounts','list_accounts','Accounts',['list']],['account','get_account','Accounts',['get']],
 ['credits','get_credits','Usage',['get']],['logs','get_logs','Usage',['list']],['usage','get_usage_stats','Usage',['get']],
];
const missing = {
 'profiles.get_viewers':'Profile visitor identities need an additional supported provider endpoint.',
 'network.recommendations':'Network recommendations need an additional supported provider endpoint.',
 'content.get_feed':'The personalised home feed needs an additional supported provider endpoint.',
 'network.check_invitation':'Exact invitation state needs a dedicated adapter; absence from a page is not proof of no invitation.',
};
const partial = {
 'accounts.list':'Lists provider accounts. Separate recruiter-seat enumeration is not implemented.',
 'enrich.search_jobs':'LinkedIn jobs only. Indeed and Glassdoor aggregation is not implemented. Requires a LinkedIn account.',
 'enrich.enrich_person':'Hunter returns available enrichment; a complete LinkedIn profile is not guaranteed.',
 'profiles.get_contact':'Returns contact fields visible in the provider profile; availability depends on access.',
 'profiles.get_reactions':'Returns reactions authored by a person, not all engagement on their posts.',
 'messages.list':'Supports INBOX and UNREAD. Other LinkupAPI categories are rejected.',
 'emails.list':'Returns inbox mail. Unread-only filtering is not supported by this adapter.',
 'conversation.get':'Requires a conversation_id. Profile URL resolution is not implemented.',
 'credits.get':'Vorlen does not issue credits. Reports Hunter usage when configured; LinkedIn provider billing stays external.',
 'profiles.search_people':'Supports common filters; unsupported filters are rejected explicitly. Cursor pagination replaces offsets.',
 'profiles.search_companies':'Supports keyword, location, industry and size. Cursor pagination replaces offsets.',
 'content.search':'Supports keyword, type, sort and date. Advanced author/mention filters require further mapping.',
 'send_message.send':'Text and base64 attachments supported. Remote media_link attachments require download support.',
};
export const operations = groups.flatMap(([group,tool,category,actions])=>actions.map(action=>({
 id:`${group}.${action}`,group,tool,category,action,label:action.replaceAll('_',' '),
 implementation:missing[`${group}.${action}`]?'planned':partial[`${group}.${action}`]?'partial':'implemented',
 limitation:missing[`${group}.${action}`]||partial[`${group}.${action}`]||null,
 provider:['logs','usage','credits'].includes(group)?'native':group==='enrich'&&!['search_jobs','extract_employees'].includes(action)?'hunter':'unipile',
 write:group.startsWith('send_'),
})));
const str={type:'string'}, count={type:'integer',minimum:1,maximum:100};
const common={account_id:str,params:{type:'object',additionalProperties:true}};
export const tools = groups.map(([group,name,category,actions])=>({
 name:`vorlen_connect_${name}`,description:`${category} in Vorlen Connect. ${group.startsWith('send_')?'Creates a persistent draft; the owner reviews and sends in the dashboard. Nothing is sent by this tool.':'Use capabilities to check provider requirements and incomplete parity.'}`,
 inputSchema:{type:'object',properties:actions.length>1?{...common,action:{type:'string',enum:actions}}:{
 ...common,conversation_id:str,profile_url:str,identifier:str,count,limit:count,cursor:str,category:str,
 unread_only:{type:'boolean'},to:str,subject:str,text:str,html:str,reply_to:str,message:str,message_text:str,
 media_file:{type:'object',properties:{data:str,filename:str},required:['data','filename']},media_link:str,
 date_from:str,date_to:str,status:str,offset:{type:'integer',minimum:0},action:str,include_seats:{type:'boolean'}},
 required:actions.length>1?['action']:[],additionalProperties:false},
 annotations:{readOnlyHint:!group.startsWith('send_'),destructiveHint:false,idempotentHint:!group.startsWith('send_'),openWorldHint:true},group,defaultAction:actions[0]
}));
tools.push({name:'vorlen_connect_capabilities',description:'Get the full 40-operation parity matrix, implementation limitations and provider setup status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},group:'capabilities',defaultAction:'get'});
export const publicTools=()=>tools.map(({group,defaultAction,...t})=>t);
export function resolveTool(name,args={}) {const t=tools.find(t=>t.name===name);if(!t)throw new Error('UNKNOWN_TOOL');return {operation:`${t.group}.${['profiles','network','recruiter','content','enrich'].includes(t.group)?args.action:t.defaultAction}`,args};}
