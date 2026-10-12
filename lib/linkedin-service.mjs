import {z} from 'zod';
import {brokerAction} from './session-broker.mjs';
import {ZernioService} from './zernio-service.mjs';
import {LinkedInClient,LINKEDIN_CALLBACK,LINKEDIN_SCOPES,validateLinkedInPost} from './linkedin.mjs';
import {directOperations,directTools} from './direct-catalog.mjs';
import {encrypt,decrypt,fail,uid,hash,now} from './security.mjs';
export class VorlenService extends ZernioService {
 li(){return new LinkedInClient(this.fetcher);}
 async liStore(action,p={}){return this.db.rpc('linkedin_'+action,p);}
 async postStore(action,p={}){return this.db.rpc('post_'+action,p);}
 async liConfig(){const r=(await this.liStore('config_get')).rows[0];if(!r)fail('LINKEDIN_APP_REQUIRED','Add your LinkedIn developer app in Connections.',424);return {...r,...JSON.parse(await decrypt(r.encrypted_secret,this.secret,this.owner+':linkedin-app'))};}
 async linkedinStatus(){const config=(await this.liStore('config_status')).rows[0];return {configured:!!config,client_id:config?.client_id||null,callback_url:LINKEDIN_CALLBACK,scopes:LINKEDIN_SCOPES.split(' '),accounts:(await this.liStore('account_list')).rows.map(a=>({...a,active:Date.parse(a.expires_at)>Date.now()})),live_verified:false};}
 async saveLinkedinApp(input){const p=z.object({client_id:z.string().trim().min(5).max(200).regex(/^[a-zA-Z0-9_-]+$/),client_secret:z.string().trim().min(8).max(1000)}).strict().parse(input);const encrypted_secret=await encrypt(JSON.stringify(p),this.secret,this.owner+':linkedin-app');await this.liStore('config_save',{client_id:p.client_id,encrypted_secret,revision:uid()});return {saved:true,verified:false,message:'Credentials saved. Complete LinkedIn authorization to verify access. Existing direct connections were cleared.'};}
 async startLinkedin(){const c=await this.liConfig();const state=uid()+uid(),binding=uid()+uid();const stored=await this.liStore('state_create',{state_hash:await hash(state),binding_hash:await hash(binding),revision:c.revision});if(stored.changes!==1)fail('OAUTH_STATE','App settings changed. Start again.',409);return {url:this.li().authorization(c.client_id,state),binding};}
 async finishLinkedin(state,binding,code){if(typeof state!=='string'||state.length>200||!binding||binding.length>200||!code||code.length>5000)fail('OAUTH_STATE','The connection request is invalid. Start again in Connections.',400);const claimed=(await this.liStore('state_claim',{state_hash:await hash(state),binding_hash:await hash(binding)})).rows[0];if(!claimed)fail('OAUTH_STATE','The connection request expired or was already used. Start again in Connections.',400);const c=await this.liConfig();if(c.revision!==claimed.revision)fail('OAUTH_STATE','App settings changed. Start again.',409);const token=await this.li().exchange(c,code);if(!token.scopes.includes('w_member_social')||!token.scopes.includes('profile'))fail('LINKEDIN_SCOPE','Enable OpenID Connect and Share on LinkedIn, then reconnect.',422);const profile=await this.li().profile(token.access_token);const id=uid();const encrypted_token=await encrypt(token.access_token,this.secret,this.owner+':linkedin:'+id);const saved=await this.liStore('account_save',{id,...profile,encrypted_token,expires_at:token.expires_at,scopes:token.scopes,revision:c.revision});if(saved.changes!==1)fail('OAUTH_STATE','App settings changed. Start again.',409);return {connected:true};}
 async disconnectLinkedin(id){z.string().uuid().parse(id);await this.liStore('account_delete',{id});return {disconnected:true,message:'Local token deleted. You can also revoke Vorlen Connect in LinkedIn Settings > Data privacy > Permitted services.'};}
 async linkedinAccount(id){z.string().uuid().parse(id);const a=(await this.liStore('account_get',{id})).rows[0];if(!a)fail('ACCOUNT_NOT_FOUND','This direct LinkedIn account is no longer connected.',404);if(Date.parse(a.expires_at)<=Date.now()+30000)fail('LINKEDIN_RECONNECT','Your LinkedIn authorization has expired. Reconnect in Connections.',424);return {...a,token:await decrypt(a.encrypted_token,this.secret,this.owner+':linkedin:'+a.id)};}

 async previewPost(id){
  z.string().uuid().parse(id);
  const row=(await this.postStore('get',{draft_id:id})).rows[0];
  if(!row)fail('DRAFT_NOT_FOUND','LinkedIn draft was not found.',404);
  const payload=JSON.parse(row.payload);
  return {draft_id:id,account_id:payload.account_id,account_name:payload.account_name,author:payload.author,content:payload.content,visibility:payload.visibility,revision:row.revision,content_hash:row.content_hash,approved_hash:row.approved_hash,review_state:row.review_state,status:row.status,scheduled_at:row.scheduled_at,post_id:row.post_id,post_url:row.post_url};
 }
 async linkedinPostAction(op,args={}){
  const idSchema=z.object({draft_id:z.string().uuid()}).strict();
  if(op==='list_pending_posts'){
   z.object({limit:z.number().int().min(1).max(100).optional()}).strict().parse(args);
   const rows=(await this.postStore('list')).rows;
   return {posts:rows.slice(0,args.limit||100).map(x=>{const p=JSON.parse(x.payload);return {draft_id:x.id,account_id:p.account_id,account_name:p.account_name,content:p.content,status:x.review_state||'pending',revision:x.revision||1,scheduled_at:x.scheduled_at||null};})};
  }
  if(op==='get_post_preview'||op==='get_post_status'){
   const p=idSchema.parse(args);const view=await this.previewPost(p.draft_id);
   return op==='get_post_preview'?view:{draft_id:view.draft_id,status:view.review_state,revision:view.revision,scheduled_at:view.scheduled_at,post_id:view.post_id,post_url:view.post_url};
  }
  if(op==='update_post_draft'){
   const p=z.object({draft_id:z.string().uuid(),revision:z.number().int().min(1),content:z.string().trim().min(1).max(3000)}).strict().parse(args);
   const view=await this.previewPost(p.draft_id);
   if(view.revision!==p.revision)fail('DRAFT_VERSION_CONFLICT','The draft changed. Review the latest version.',409);
   const payload={account_id:view.account_id,account_name:view.account_name,author:view.author,visibility:'PUBLIC',content:p.content};
   const changed=await this.postStore('edit',{draft_id:p.draft_id,revision:p.revision,payload});
   if(changed.changes!==1)fail('DRAFT_VERSION_CONFLICT','The draft is no longer editable.',409);
   return {...await this.previewPost(p.draft_id),approval_invalidated:true};
  }
  if(op==='approve_post'){
   const p=z.object({draft_id:z.string().uuid(),revision:z.number().int().min(1),content_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(args);
   const view=await this.previewPost(p.draft_id);
   if(view.revision!==p.revision||view.content_hash!==p.content_hash)fail('DRAFT_VERSION_CONFLICT','Preview the latest draft before approving.',409);
   const changed=await this.postStore('approve',p);
   if(changed.changes!==1)fail('APPROVAL_REJECTED','The draft is not pending or was modified.',409);
   return {draft_id:p.draft_id,approved:true,revision:p.revision,content_hash:p.content_hash,account_id:view.account_id,content:view.content,next_step:'Request publish_post or schedule_post to publish this exact approved version.'};
  }
  if(op==='reject_post'){
   const p=z.object({draft_id:z.string().uuid(),revision:z.number().int().min(1)}).strict().parse(args);
   const changed=await this.postStore('reject',p);
   if(changed.changes!==1)fail('DRAFT_VERSION_CONFLICT','This draft cannot be rejected now.',409);
   return {draft_id:p.draft_id,rejected:true};
  }
  if(op==='schedule_post'){
   const p=z.object({draft_id:z.string().uuid(),revision:z.number().int().min(1),scheduled_at:z.string().datetime({offset:true})}).strict().parse(args);
   const at=Date.parse(p.scheduled_at);
   if(!Number.isFinite(at)||at<Date.now()+60000||at>Date.now()+365*86400000)fail('INVALID_SCHEDULE','Schedule between one minute and one year from now.',422);
   const changed=await this.postStore('schedule',p);
   if(changed.changes!==1)fail('SCHEDULE_REJECTED','Only an approved and unchanged draft can be scheduled.',409);
   return {draft_id:p.draft_id,status:'scheduled',scheduled_at:p.scheduled_at};
  }
  if(op==='publish_post'){
   const p=z.object({draft_id:z.string().uuid(),revision:z.number().int().min(1)}).strict().parse(args);
   const view=await this.previewPost(p.draft_id);
   if(view.revision!==p.revision||view.review_state!=='approved')fail('APPROVAL_REQUIRED','Approve the exact current revision before publishing.',409);
   return this.publishApprovedPost(p.draft_id,p.revision);
  }
  fail('UNKNOWN_OPERATION','Unknown direct LinkedIn action.',404);
 }
 async publishApprovedPost(id,revision){
  const preview=await this.previewPost(id);
  if(preview.revision!==revision||!['approved','scheduled'].includes(preview.review_state))fail('APPROVAL_REQUIRED','This revision is not approved.',409);
  const a=await this.linkedinAccount(preview.account_id);
  if(preview.author!=='urn:li:person:'+a.subject||!a.scopes.includes('w_member_social'))fail('LINKEDIN_ACCOUNT_CHANGED','Account or publishing permissions changed.',409);
  await this.rate('send',10);
  const attempt=uid();
  const claimed=await this.postStore('claim',{draft_id:id,revision,attempt_key:attempt});
  if(claimed.changes!==1)fail('PUBLISH_ALREADY_CLAIMED','This post was already claimed or not yet due. No duplicate call was made.',409);
  try{
   const result=await this.li().publish(a.token,a.subject,preview.content);
   const postId=result.acknowledged?result.post_id:null;
   const url=postId?'https://www.linkedin.com/feed/update/'+encodeURIComponent(postId):null;
   const saved=await this.postStore('finish',{draft_id:id,revision,attempt_key:attempt,post_id:postId,post_url:url});
   if(saved.changes!==1)fail('PUBLISH_OUTCOME_UNCERTAIN','LinkedIn responded but completion storage was unconfirmed. Do not retry.',503);
   return {draft_id:id,status:postId?'published':'unknown',post_id:postId,post_url:url,acknowledged:!!postId};
  }catch(e){
   await this.postStore('finish',{draft_id:id,revision,attempt_key:attempt,post_id:null,post_url:null}).catch(()=>null);
   throw e;
  }
 }
 async capabilities(){const base=await super.capabilities();const status=await this.linkedinStatus();return {...base,version:'0.4.0',session_integration:{provider:'vorlen_session_worker',connection_url:'/?tab=direct','authentication':'Direct & access: login, OTP or owner session import',implemented:['profile','inbox','conversation','invitations','connections','search_people','approved_message','approved_invitation','recruiter_workspace'],live_verification:'requires_connected_account',not_implemented:['full_recruiter_search','cv_download','job_management','country_proxy_routing']},primary_provider:'direct_linkedin_with_optional_zernio',tools:directTools().length,providers:[...base.providers,...(status.configured?[{provider:'linkedin_direct',base_url:'https://api.linkedin.com',connected_accounts:status.accounts.length}]:[])],operations:[...base.operations,...directOperations.map(o=>({...o,state:o.id==='linkedin.status'?'available':status.accounts.some(a=>a.active)?'configured_not_live_verified':'needs_connection'}))]};}
 async call(op,args={}){if(op.startsWith('session.'))return {data:await brokerAction(this,op.slice(8),args),meta:{provider:'vorlen_session_worker'}};if(!op.startsWith('linkedin.'))return super.call(op,args);const started=Date.now();await this.rate();try{let data;if(['list_pending_posts','get_post_preview','update_post_draft','approve_post','reject_post','publish_post','schedule_post','get_post_status'].includes(op.slice('linkedin.'.length))){data=await this.linkedinPostAction(op.slice('linkedin.'.length),args);}else if(op==='linkedin.status'){z.object({}).strict().parse(args);data=await this.linkedinStatus();}else if(op==='linkedin.profile'){const p=z.object({account_id:z.string().uuid()}).strict().parse(args);const a=await this.linkedinAccount(p.account_id);data=await this.li().profile(a.token);}else if(op==='linkedin.create_post'){const p=validateLinkedInPost(args);const a=await this.linkedinAccount(p.account_id);if(!a.scopes.includes('w_member_social'))fail('LINKEDIN_SCOPE','Member publishing permission is missing.',422);const payload={...p,author:'urn:li:person:'+a.subject,account_name:a.name,visibility:'PUBLIC'};const fingerprint=await hash({op,payload});await this.stmt('INSERT INTO vc_drafts(id,owner,operation,payload,fingerprint,status,result,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?) ON CONFLICT(owner,fingerprint) DO NOTHING',uid(),this.owner,op,JSON.stringify(payload),fingerprint,'pending',now(),now()).run();const d=await this.stmt('SELECT * FROM vc_drafts WHERE owner=? AND fingerprint=?',this.owner,fingerprint).first();data={draft_id:d.id,status:d.status,sent:false,next_step:'Review the public LinkedIn post in Outreach before approving.'};}else fail('UNKNOWN_OPERATION','Unknown direct operation.',404);await this.log(op,args,op==='linkedin.create_post'?'drafted':'success',started);return {data,meta:{operation:op,provider:'linkedin_direct',retrieved_at:now()}};}catch(e){await this.log(op,args,'error',started,e);throw e;}}
 async sendDraft(id){
  const d=await this.stmt('SELECT * FROM vc_drafts WHERE owner=? AND id=?',this.owner,id).first();
  if(d?.operation!=='linkedin.create_post')return super.sendDraft(id);
  const p=await this.previewPost(id);
  if(p.review_state!=='approved')fail('APPROVAL_REQUIRED','Approve the latest draft revision before publishing.',409);
  return this.publishApprovedPost(id,p.revision);
 }
}
