import {z} from 'zod';
import {fail} from './security.mjs';
const text=z.string().trim().min(1).max(1000);
const id=text.refine(v=>v!=='.'&&v!=='..'&&!/[\u0000-\u001f]/.test(v),'Invalid identifier');
const limit=z.number().int().min(1).max(100).optional();
const cursor=z.string().max(4000).optional();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const enc=encodeURIComponent;
export const messagingPlatforms=['facebook','instagram','twitter','bluesky','reddit','telegram','whatsapp','imessage'];
export const publishingPlatforms=['linkedin','facebook','twitter','threads','bluesky','instagram','telegram','discord','slack'];
export const oauthPlatforms=['linkedin','facebook','instagram','twitter','threads','youtube','tiktok','pinterest','reddit','googlebusiness'];
const account={account_id:id};
const page={limit,page:z.number().int().min(1).optional()};
const filter={profile_id:id.optional(),account_id:id.optional(),platform:text.optional()};
const schemas={
 list_profiles:z.object({}).strict(),
 list_posts:z.object({...filter,...page,status:z.enum(['draft','scheduled','publishing','published','partial','failed','cancelled']).optional(),search:text.optional(),from_date:day,to_date:day}).strict(),
 get_post:z.object({post_id:id}).strict(),
 analytics:z.object({...filter,...page,post_id:id.optional(),from_date:day,to_date:day}).strict(),
 linkedin_analytics:z.object({...account,from_date:day,to_date:day,aggregation:z.enum(['TOTAL','DAILY']).optional()}).strict(),
 linkedin_post_analytics:z.object({...account,urn:z.string().regex(/^urn:li:(share|ugcPost|activity):[0-9]+$/)}).strict(),
 linkedin_organizations:z.object(account).strict(),
 linkedin_reactions:z.object({...account,urn:z.string().regex(/^urn:li:(share|ugcPost|activity):[0-9]+$/),limit,cursor:z.coerce.number().int().min(0).optional()}).strict(),
 account_health:z.object(account).strict(),
 list_conversations:z.object({...filter,platform:z.enum(messagingPlatforms).optional(),status:z.enum(['active','archived']).optional(),folder:z.enum(['inbox','requests']).optional(),limit,cursor}).strict(),
 get_conversation:z.object({...account,conversation_id:id}).strict(),
 list_messages:z.object({...account,conversation_id:id,limit,cursor,sort_order:z.enum(['asc','desc']).optional()}).strict(),
 list_commented_posts:z.object({...filter,limit,cursor}).strict(),
 get_comments:z.object({...account,post_id:id,comment_id:id.optional(),limit,cursor}).strict(),
};
export const zernioReadActions=Object.keys(schemas);
export function publicMediaUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.indexOf('.')<1||/^(\d|\[)/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname))fail('INVALID_MEDIA_URL','Use a public HTTPS media URL without credentials.');return u.href;}
const media=z.object({type:z.enum(['image','video','document']),url:z.string().url().transform(publicMediaUrl)}).strict();
const writes={
 create_post:z.object({content:z.string().trim().min(1).max(20000),platforms:z.array(z.object({platform:z.enum(publishingPlatforms),account_id:id}).strict()).min(1).max(10),media_items:z.array(media).max(20).default([]),mode:z.enum(['publish','schedule']),scheduled_for:z.string().datetime({offset:true}).optional()}).strict(),
 reply_message:z.object({...account,conversation_id:id,message:z.string().trim().min(1).max(10000)}).strict(),
 reply_comment:z.object({...account,post_id:id,comment_id:id.optional(),message:z.string().trim().min(1).max(10000)}).strict(),
};
export function validateZernioDraft(action,input){
 const schema=writes[action];if(!schema)fail('INVALID_OPERATION','Unknown Zernio draft action.');const p=schema.parse(input);
 if(action==='create_post'){
  if(p.mode==='schedule'&&(!p.scheduled_for||Date.parse(p.scheduled_for)<=Date.now()+60000))fail('INVALID_SCHEDULE','Scheduled time must be at least one minute in the future.');
  if(p.mode==='publish'&&p.scheduled_for)fail('INVALID_SCHEDULE','Immediate posts cannot also have a scheduled time.');
  if(new Set(p.platforms.map(x=>x.account_id)).size!==p.platforms.length)fail('INVALID_INPUT','Each account can appear only once.');
  const kinds=new Set(p.media_items.map(m=>m.type));if(kinds.size>1)fail('INVALID_INPUT','Use one media type per post.');
  if(kinds.has('video')&&p.media_items.length!==1||kinds.has('document')&&(p.media_items.length!==1||p.platforms.some(x=>x.platform!=='linkedin')))fail('INVALID_INPUT','Use one video, or one PDF targeting LinkedIn only.');
  if(kinds.has('document')&&!/\.pdf(?:\?|$)/i.test(p.media_items[0].url))fail('INVALID_INPUT','LinkedIn documents must be PDF files.');
  for(const target of p.platforms){
   const max={linkedin:3000,twitter:280,threads:500,bluesky:300}[target.platform];if(max&&p.content.length>max)fail('INVALID_INPUT',`${target.platform} text is limited to ${max} characters in this composer.`);
   if(target.platform==='instagram'&&(!p.media_items.length||kinds.has('document')))fail('INVALID_INPUT','Instagram requires image or video media.');
   const maxImages={linkedin:20,facebook:10,instagram:10,twitter:4,bluesky:4,threads:20}[target.platform]||10;if(p.media_items.length>maxImages)fail('INVALID_INPUT',`Too many media items for ${target.platform}.`);
  }
 }
 return p;
}
export function zernioRecipient(action,p){return action==='reply_message'?`zernio:${p.account_id}:${p.conversation_id}`:null;}
export function sanitizeZernio(value){if(Array.isArray(value))return value.map(sanitizeZernio);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(token|secret|password|credential|api.?key|authorization)/i.test(k)).map(([k,v])=>[k,sanitizeZernio(v)]));return value;}
export function publicAccount(a){return {id:a._id||a.id,name:a.displayName||a.username||'Connected account',type:a.platform,platform:a.platform,profile_id:typeof a.profileId==='object'?a.profileId?._id:a.profileId,username:a.username,profile_url:a.profileUrl,active:a.isActive===true,needs_reconnection:a.needsReconnection===true,account_type:a.metadata?.accountType||null};}
export class ZernioClient {
 constructor(key,fetcher=(...a)=>globalThis.fetch(...a)){if(!key)fail('PROVIDER_NOT_CONNECTED','Zernio is not configured for this workspace.',424);this.key=key;this.fetcher=(...args)=>fetcher.call(globalThis,...args);}
 async request(path,{query={},body,idempotencyKey}={}){
  const url=new URL('https://zernio.com/api/v1/'+path);if(url.origin!=='https://zernio.com'||!url.pathname.startsWith('/api/v1/'))fail('INVALID_OPERATION','Invalid provider path.');
  for(const [k,v]of Object.entries(query))if(v!==undefined)url.searchParams.set(k,String(v));
  let r;try{r=await this.fetcher(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+this.key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(body?45000:20000)});}catch{fail('PROVIDER_UNREACHABLE','Zernio did not confirm completion. Requests are not automatically retried.',502);}
  if(!r.ok)fail(r.status===429?'PROVIDER_RATE_LIMIT':'PROVIDER_ERROR',`Zernio returned HTTP ${r.status}. Check the account connection, permissions and plan.`,r.status===429?429:502,{upstream_status:r.status,...(r.headers.get('retry-after')?{retry_after:r.headers.get('retry-after')}:{})});
  const raw=await r.text();if(raw.length>4*1024*1024)fail('RESPONSE_TOO_LARGE','Request fewer records.',502);let data;try{data=JSON.parse(raw);}catch{fail('PROVIDER_PROTOCOL','Unexpected Zernio response.',502);}
  if(data.error||data.success===false)fail('PROVIDER_ERROR','Zernio reported that the request failed.',502);
  data=sanitizeZernio(data);return r.status===202?{status:'pending',data}:data;
 }
 async accounts(){const r=await this.request('accounts');if(!Array.isArray(r.accounts))fail('PROVIDER_PROTOCOL','Zernio did not return an account list.',502);return {items:r.accounts.map(publicAccount),has_analytics_access:!!r.hasAnalyticsAccess};}
 async account(accountId){const a=(await this.accounts()).items.find(x=>x.id===accountId);if(!a)fail('ACCOUNT_NOT_FOUND','Choose an account connected to this Zernio workspace.',404);return a;}
 async messagingAccount(accountId){const a=await this.account(accountId);if(!messagingPlatforms.includes(a.platform))fail('UNSUPPORTED_PLATFORM',`${a.platform} messaging is not available through Zernio. LinkedIn DMs are unsupported.`,422);if(!a.active||a.needs_reconnection)fail('ACCOUNT_RECONNECT_REQUIRED','Reconnect this account in Zernio.',409);return a;}
 async read(action,args={}){
  if(!schemas[action])fail('INVALID_OPERATION','Unknown Zernio read action.');const p=schemas[action].parse(args);
  if(['get_conversation','list_messages'].includes(action)||action==='list_conversations'&&p.account_id)await this.messagingAccount(p.account_id);
  if(action==='linkedin_reactions'){const a=await this.account(p.account_id);if(a.platform!=='linkedin'||a.account_type!=='organization')fail('UNSUPPORTED_PLATFORM','LinkedIn reactor identities require a connected organization page; personal profiles are unsupported.',422);}
  const q={};const names={account_id:'accountId',profile_id:'profileId',post_id:'postId',comment_id:'commentId',from_date:'fromDate',to_date:'toDate',sort_order:'sortOrder'};
  for(const [k,v]of Object.entries(p))q[names[k]||k]=v;
  let path;
  switch(action){
   case 'list_profiles':path='profiles';break;case 'list_posts':path='posts';break;case 'get_post':path='posts/'+enc(p.post_id);delete q.postId;break;case 'analytics':path='analytics';break;
   case 'linkedin_analytics':case 'linkedin_post_analytics':case 'linkedin_reactions':case 'linkedin_organizations':case 'account_health':
    path='accounts/'+enc(p.account_id)+'/'+({linkedin_analytics:'linkedin-aggregate-analytics',linkedin_post_analytics:'linkedin-post-analytics',linkedin_reactions:'linkedin-post-reactions',linkedin_organizations:'linkedin-organizations',account_health:'health'}[action]);delete q.accountId;break;
   case 'list_conversations':path='inbox/conversations';break;case 'get_conversation':case 'list_messages':path='inbox/conversations/'+enc(p.conversation_id)+(action==='list_messages'?'/messages':'');delete q.conversation_id;break;
   case 'list_commented_posts':path='inbox/comments';break;case 'get_comments':path='inbox/comments/'+enc(p.post_id);delete q.postId;break;
  }
  return this.request(path,{query:q});
 }
 async connect(platform,origin,profileId){if(!oauthPlatforms.includes(platform))fail('UNSUPPORTED_PLATFORM','Connect this platform in the Zernio dashboard.');const profiles=await this.read('list_profiles');const chosen=profileId||profiles.profiles?.find(x=>x.isDefault)?._id||profiles.profiles?.[0]?._id;if(!chosen||!profiles.profiles?.some(x=>x._id===chosen))fail('PROFILE_REQUIRED','Create or select a profile in Zernio first.');const r=await this.request('connect/'+enc(platform),{query:{profileId:chosen,redirect_url:origin+'/?tab=connections',scopes:'posting,analytics,comments,messaging'}});const u=new URL(r.authUrl);if(u.protocol!=='https:'||u.username||u.password)fail('PROVIDER_PROTOCOL','Zernio returned an invalid sign-in URL.',502);return {url:u.href};}
 async write(action,input,draftId){const p=validateZernioDraft(action,input);
  if(action==='create_post'){
   for(const target of p.platforms){const a=await this.account(target.account_id);if(a.platform!==target.platform||!a.active||a.needs_reconnection)fail('ACCOUNT_RECONNECT_REQUIRED','Selected account does not match or needs reconnection.',409);}
   validateZernioDraft(action,p); // Recheck the schedule after account validation network calls.
   return this.request('posts',{body:{content:p.content,platforms:p.platforms.map(t=>({platform:t.platform,accountId:t.account_id})),mediaItems:p.media_items,...(p.mode==='schedule'?{scheduledFor:p.scheduled_for,timezone:'UTC'}:{publishNow:true})},idempotencyKey:draftId});
  }
  if(action==='reply_message'){await this.messagingAccount(p.account_id);return this.request('inbox/conversations/'+enc(p.conversation_id)+'/messages',{body:{accountId:p.account_id,message:p.message},idempotencyKey:draftId});}
  await this.account(p.account_id);return this.request('inbox/comments/'+enc(p.post_id),{body:{accountId:p.account_id,message:p.message,...(p.comment_id?{commentId:p.comment_id}:{})},idempotencyKey:draftId});
 }
}
export function zernioAcknowledged(action,r){return action==='create_post'?!!r.post?._id&&['published','scheduled'].includes(r.post.status)&&!r.post.platforms?.some(p=>['failed','partial'].includes(p.status)):action==='reply_comment'?r.success===true&&!!r.data?.commentId:r.success===true&&!!(r.data?.messageId||r.data?.conversationId||r.data?.messageIds?.length);}
