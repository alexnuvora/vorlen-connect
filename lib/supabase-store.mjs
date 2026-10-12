import {fail} from './security.mjs';

// Fixed application query contract -> named, parameterised RPC operations.
// No SQL text is ever sent to Supabase or executed dynamically.
export class SupabaseStore {
 constructor(url,key,owner,fetcher=(...args)=>globalThis.fetch(...args)){
  if(!url||!key||!owner)fail('SERVER_CONFIGURATION','Supabase is not configured.',503);
  const origin=new URL(url);if(origin.protocol!=='https:'||origin.hostname!=='oulypjxpbrlxbjrxzryf.supabase.co'||origin.pathname!=='/')fail('SERVER_CONFIGURATION','Unexpected Supabase project.',503);
  this.url=origin.origin;this.key=key;this.owner=owner;this.fetcher=fetcher;
 }
 prepare(sql){return {bind:(...args)=>({
  first:async()=>{const r=await this.execute(sql,args);return r.rows[0]||null;},
  all:async()=>{const r=await this.execute(sql,args);return {results:r.rows};},
  run:async()=>{const r=await this.execute(sql,args);return {meta:{changes:r.changes}};},
 })};}
 async execute(sql,a){
  let action,params={};
  const owned=index=>{if(a[index]!==this.owner)fail('OWNER_MISMATCH','Database owner mismatch.',403);};
  if(sql==='SELECT * FROM vc_providers WHERE owner=? AND provider=?'||sql==='SELECT id FROM vc_providers WHERE owner=? AND provider=?'){owned(0);action='provider_get';params={provider:a[1]};}
  else if(sql==='SELECT provider,base_url,updated_at FROM vc_providers WHERE owner=?'){owned(0);action='provider_list';}
  else if(sql.startsWith('INSERT INTO vc_providers(')){owned(1);action='provider_upsert';params={id:a[0],provider:a[2],base_url:a[3],encrypted_key:a[4],updated_at:a[5]};}
  else if(sql==='DELETE FROM vc_providers WHERE owner=? AND provider=?'){owned(0);action='provider_delete';params={provider:a[1]};}
  else if(sql.startsWith('INSERT INTO vc_rate_buckets ')){if(!a[0].startsWith(this.owner+':'))fail('OWNER_MISMATCH','Rate bucket owner mismatch.',403);action='rate_increment';params={key:a[0],expires_at:a[1]};}
  else if(sql==='DELETE FROM vc_rate_buckets WHERE expires_at<?'){action='rate_cleanup';params={timestamp:a[0]};}
  else if(sql.startsWith('INSERT INTO vc_activity(')){owned(1);action='activity_insert';params={id:a[0],operation:a[2],account_id:a[3],status:a[4],error_code:a[5],duration_ms:a[6],created_at:a[7]};}
  else if(sql.startsWith('SELECT * FROM vc_activity WHERE owner=?')){owned(0);action='activity_list';let i=1;for(const key of ['account_id','operation','status'])if(sql.includes(` AND ${key}=?`))params[key]=a[i++];params.limit=a[i++];params.offset=a[i];}
  else if(sql.startsWith('SELECT operation,account_id,status,count(*) AS calls FROM vc_activity WHERE owner=?')){owned(0);action='usage';let i=1;if(sql.includes(' AND account_id=?'))params.account_id=a[i++];if(sql.includes(' AND created_at>=?'))params.date_from=a[i++];if(sql.includes(' AND created_at<=?'))params.date_to=a[i++];}
  else if(sql==='SELECT * FROM vc_contacts WHERE owner=? ORDER BY created_at DESC LIMIT 100'){owned(0);action='contact_list';}
  else if(sql.startsWith('INSERT INTO vc_contacts(')){owned(1);action='contact_upsert';params={id:a[0],name:a[2],kind:a[3],source_url:a[4],notes:a[5],created_at:a[6]};}
  else if(sql==='DELETE FROM vc_contacts WHERE owner=? AND id=?'){owned(0);action='contact_delete';params={id:a[1]};}
  else if(sql==='SELECT * FROM vc_drafts WHERE owner=? ORDER BY created_at DESC LIMIT 100'){owned(0);action='draft_list';}
  else if(sql.startsWith('INSERT INTO vc_drafts(')){owned(1);action='draft_insert';params={id:a[0],operation:a[2],payload:a[3],fingerprint:a[4],status:a[5],created_at:a[6],updated_at:a[7]};}
  else if(sql==='SELECT * FROM vc_drafts WHERE owner=? AND fingerprint=?'){owned(0);action='draft_fingerprint';params={fingerprint:a[1]};}
  else if(sql==='SELECT * FROM vc_drafts WHERE owner=? AND id=?'){owned(0);action='draft_get';params={id:a[1]};}
  else if(sql==="UPDATE vc_drafts SET status='sending',updated_at=? WHERE owner=? AND id=? AND status='pending'"){owned(1);action='draft_claim';params={updated_at:a[0],id:a[2]};}
  else if(sql==='UPDATE vc_drafts SET status=?,result=?,updated_at=? WHERE owner=? AND id=?'){owned(3);action='draft_result';params={status:a[0],result:a[1],updated_at:a[2],id:a[4]};}
  else if(sql==="UPDATE vc_drafts SET status='unknown',result=?,updated_at=? WHERE owner=? AND id=?"){owned(2);action='draft_result';params={status:'unknown',result:a[0],updated_at:a[1],id:a[3]};}
  else if(sql==="UPDATE vc_drafts SET status='cancelled',updated_at=? WHERE owner=? AND id=? AND status='pending'"){owned(1);action='draft_cancel';params={updated_at:a[0],id:a[2]};}
  else if(sql==='SELECT * FROM vc_suppressions WHERE owner=? ORDER BY created_at DESC LIMIT 100'){owned(0);action='suppression_list';}
  else if(sql==='SELECT id FROM vc_suppressions WHERE owner=? AND recipient=?'){owned(0);action='suppression_get';params={recipient:a[1]};}
  else if(sql.startsWith('INSERT INTO vc_suppressions(')){owned(1);action='suppression_upsert';params={id:a[0],recipient:a[2],reason:a[3],created_at:a[4]};}
  else fail('STORE_CONTRACT_ERROR','Unsupported database operation.',500);
  return this.rpc(action,params);
 }
 async rpc(action,params){
  let response;try{response=await this.fetcher(this.url+'/rest/v1/rpc/'+(action.startsWith('oauth_')?'vc_oauth_control':action.startsWith('post_')?'vc_linkedin_post_control':action.startsWith('linkedin_')?'vc_linkedin_store':action==='session_broker'?'vc_session_broker':action==='session_manage'?'vc_session_manage':'vc_store'),{method:'POST',headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json'},body:JSON.stringify({p_action:['session_manage','session_broker'].includes(action)?params.action:action.startsWith('oauth_')?action.slice(6):action.startsWith('post_')?action.slice(5):action,p_owner:this.owner,p:params}),redirect:'manual',signal:AbortSignal.timeout(15000)});}catch(error){const detail=String(error?.message||error).replaceAll(this.key,'[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,240);console.error('Supabase transport failure',JSON.stringify({name:error?.name||'Error',detail}));fail('DATABASE_UNREACHABLE','Supabase did not confirm the database operation. Please refresh before retrying.',503);}
  if(!response.ok)fail('DATABASE_ERROR',`Supabase returned HTTP ${response.status}.`,503);
  const data=await response.json();if(!data||!Array.isArray(data.rows)||typeof data.changes!=='number')fail('DATABASE_PROTOCOL','Unexpected database response.',503);return data;
 }
}
