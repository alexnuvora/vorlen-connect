import {ConnectService} from './service.mjs';
import {activeOperations,activeTools} from './zernio-catalog.mjs';
import {ZernioClient,validateZernioDraft,zernioRecipient,zernioAcknowledged} from './zernio.mjs';
import {fail,now,uid,hash} from './security.mjs';
export class ZernioService extends ConnectService {
 constructor(db,owner,secret,settings={},fetcher){super(db,owner,secret,fetcher);this.zernioKey=owner===settings.ZERNIO_OWNER_ID?settings.ZERNIO_API_KEY:undefined;}
 client(){return new ZernioClient(this.zernioKey,this.fetcher);}
 async capabilities(){const stored=await this.all('SELECT provider,base_url,updated_at FROM vc_providers WHERE owner=?',this.owner);const providers=stored.filter(p=>p.provider==='hunter');if(this.zernioKey)providers.unshift({provider:'zernio',base_url:'https://zernio.com',managed:true});return {name:'Vorlen Connect',version:'0.2.0',primary_provider:'zernio',parity_complete:false,tools:activeTools().length,operations:activeOperations.map(op=>({...op,state:op.implementation==='unavailable'?'unsupported_by_zernio':op.provider==='native'?'available':providers.some(p=>p.provider===op.provider)?'configured':'needs_connection'})),providers};}
 async saveProvider(input){if(input.provider!=='hunter')fail('MANAGED_PROVIDER','Zernio is configured securely for the workspace owner. Unipile has been replaced.');return super.saveProvider(input);}
 async removeProvider(provider){if(provider==='zernio')fail('MANAGED_PROVIDER','Zernio uses a managed server secret. Rotate or remove it in site settings.');return super.removeProvider(provider);}
 async connect(platform,origin,profileId){return this.client().connect(String(platform).toLowerCase(),origin,profileId);}
 async call(op,args={}){
  if(op==='capabilities.get')return this.capabilities();const cap=activeOperations.find(o=>o.id===op);if(!cap)fail('UNKNOWN_OPERATION','Unknown operation.',404);
  if(cap.implementation==='unavailable')fail('UNSUPPORTED_BY_ZERNIO',cap.limitation,422);
  if(cap.provider!=='zernio')return super.call(op,args);
  if(!args||typeof args!=='object'||Array.isArray(args))fail('INVALID_INPUT','Arguments must be an object.');
  await this.rate();const started=Date.now();try{
   let data;const c=this.client();
   if(cap.write)data=await this.createZernioDraft(op,args);
   else if(op.startsWith('zernio.'))data=await c.read(cap.action,args);
   else if(op==='accounts.list'){if(Object.keys(args).some(k=>!['include_seats','action','params'].includes(k))||args.include_seats||Object.keys(args.params||{}).length)fail('UNSUPPORTED_PARAMETER','Zernio account listing does not support recruiter seats or legacy pagination parameters.');data=await c.accounts();}
   else if(['account.get','profiles.get_me'].includes(op)){const a=args.account_id;if(!a)fail('ACCOUNT_REQUIRED','Choose a Zernio account_id.');data=await c.account(a);}
   else {
    const p={...(args.params||args)};delete p.params;delete p.action;const account_id=args.account_id||p.account_id;delete p.account_id;
    if(p.count!==undefined){p.limit=p.count;delete p.count;}
    if(op==='messages.list'){if(p.category&&p.category!=='INBOX')fail('UNSUPPORTED_PARAMETER','Use Zernio inbox filters; legacy categories are not supported.');delete p.category;data=await c.read('list_conversations',{...p,...(account_id?{account_id}:{})});}
    else if(op==='conversation.get')data=await c.read('list_messages',{...p,account_id});
    else {let post_id=p.post_id||p.post_url;if(p.post_url){const u=new URL(p.post_url);if(u.protocol!=='https:'||!/(^|\.)linkedin\.com$/.test(u.hostname))fail('INVALID_INPUT','Use a LinkedIn post URL or a provider post_id.');const m=p.post_url.match(/(?:activity-|activity:|share:|ugcPost:)(\d+)/);if(!m)fail('INVALID_INPUT','Cannot resolve the post ID.');post_id='urn:li:activity:'+m[1];}delete p.post_id;delete p.post_url;data=await c.read(op==='content.get_comments'?'get_comments':'linkedin_reactions',{...p,account_id,...(op==='content.get_comments'?{post_id}:{urn:post_id})});}
   }
   await this.log(op,args,cap.write?'drafted':'success',started);return {data,meta:{operation:op,provider:'zernio',retrieved_at:now()}};
  }catch(e){await this.log(op,args,'error',started,e);throw e;}
 }
 async createZernioDraft(op,input){
  this.client();const action=op.split('.')[1];const p=validateZernioDraft(action,input);const recipient=zernioRecipient(action,p);if(recipient&&await this.isSuppressed(recipient))fail('RECIPIENT_SUPPRESSED','This conversation is suppressed.',409);
  if(action==='reply_message')await this.client().messagingAccount(p.account_id);
  const fingerprint=await hash({op,payload:p});await this.stmt('INSERT INTO vc_drafts(id,owner,operation,payload,fingerprint,status,result,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?) ON CONFLICT(owner,fingerprint) DO NOTHING',uid(),this.owner,op,JSON.stringify(p),fingerprint,'pending',now(),now()).run();const d=await this.stmt('SELECT * FROM vc_drafts WHERE owner=? AND fingerprint=?',this.owner,fingerprint).first();return {draft_id:d.id,status:d.status,sent:false,next_step:'Review the draft in Outreach, then approve the exact post or reply.'};
 }
 async sendDraft(id){
  const d=await this.stmt('SELECT * FROM vc_drafts WHERE owner=? AND id=?',this.owner,id).first();if(!d)fail('NOT_FOUND','Draft not found.',404);if(d.status!=='pending')fail('DRAFT_ALREADY_HANDLED',`Draft is ${d.status}; it cannot be sent again.`,409);
  if(!d.operation.startsWith('zernio.'))fail('PROVIDER_REPLACED','This draft used Unipile. It cannot be sent through Zernio. Cancel it and create a supported Zernio draft.',422);
  const action=d.operation.split('.')[1],p=validateZernioDraft(action,JSON.parse(d.payload));const recipient=zernioRecipient(action,p);if(recipient&&await this.isSuppressed(recipient))fail('RECIPIENT_SUPPRESSED','This conversation is suppressed.',409);
  const client=this.client();await this.rate('send',10);const claim=await this.stmt("UPDATE vc_drafts SET status='sending',updated_at=? WHERE owner=? AND id=? AND status='pending'",now(),this.owner,id).run();if(claim.meta.changes!==1)fail('DRAFT_ALREADY_HANDLED','Another request already claimed this draft.',409);const started=Date.now();
  try{const result=await client.write(action,p,id);const status=zernioAcknowledged(action,result)?'sent':'unknown';await this.stmt('UPDATE vc_drafts SET status=?,result=?,updated_at=? WHERE owner=? AND id=?',status,JSON.stringify(result),now(),this.owner,id).run();await this.log(d.operation,p,status,started);return {draft_id:id,status,provider_status:result.post?.status||null,result};}
  catch(e){await this.stmt("UPDATE vc_drafts SET status='unknown',result=?,updated_at=? WHERE owner=? AND id=?",JSON.stringify({error:e.code||'UNKNOWN',message:'Check Zernio before attempting another send.'}),now(),this.owner,id).run();await this.log(d.operation,p,'unknown',started,e);throw e;}
 }
 async suppress(input){if(typeof input.recipient==='string'&&input.recipient.startsWith('zernio:')){const r=input.recipient.trim();if(r.length>1000||/[\u0000-\u001f]/.test(r)||!/^zernio:[^:]+:.+/.test(r))fail('INVALID_INPUT','Use zernio:account_id:conversation_id.');await this.stmt('INSERT INTO vc_suppressions(id,owner,recipient,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(owner,recipient) DO UPDATE SET reason=excluded.reason',uid(),this.owner,r,String(input.reason||'Do not contact').slice(0,500),now()).run();return {suppressed:true,recipient:r};}return super.suppress(input);}
}
