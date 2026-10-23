import { verifyWorkerRequest } from '@/lib/session-worker-auth.mjs';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

export async function POST(request: Request) {
 const reader=request.body?.getReader();
 if(!reader)return json({error:'invalid request'},400);
 let length=0;const chunks:Uint8Array[]=[];
 while(true){
  const {done,value}=await reader.read();if(done)break;
  length+=value.length;
  if(length>262144){await reader.cancel();return json({error:'too large'},413);}
  chunks.push(value);
 }
 const raw=Buffer.concat(chunks);
 const nonce=verifyWorkerRequest(request.headers,raw,process.env.VORLEN_SESSION_WORKER_PUBLIC_KEY);
 if(!nonce)return json({error:'unauthorised'},401);
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'backend not configured'},503);
 // The shared nonce table prevents a signed request from being replayed.
 try{
  const used=await fetch(url+'/rest/v1/vc_session_worker_nonces',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({nonce}),cache:'no-store',signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!used.ok)return json({error:used.status===409?'replayed request':'worker authentication unavailable'},used.status===409?401:503);
 }catch{return json({error:'worker authentication unavailable'},503);}
 let input:{action?:string;worker_id?:string;id?:string;lease_token?:string;success?:boolean;result?:unknown;error?:string};
 try{input=JSON.parse(raw.toString('utf8'));}catch{return json({error:'invalid JSON'},400);}
 if(!['claim','finish','progress'].includes(input.action||''))return json({error:'invalid action'},400);
 const path=input.action==='claim'?'vc_worker_claim':input.action==='progress'?'vc_worker_progress':'vc_worker_finish';
 const params=input.action==='claim'?{p_worker:input.worker_id}:input.action==='progress'?{p_id:input.id,p_lease:input.lease_token,p_result:input.result??{}}:{
  p_id:input.id,p_lease:input.lease_token,p_success:input.success,p_result:input.result??{},p_error:input.error??null};
 if(input.action==='claim'&&(typeof input.worker_id!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(input.worker_id)))return json({error:'invalid worker'},400);
 if(input.action!=='claim'&&(!/^[0-9a-f-]{36}$/i.test(input.id||'')||!/^[0-9a-f-]{36}$/i.test(input.lease_token||'')||(input.action==='finish'&&typeof input.success!=='boolean')))return json({error:'invalid lease'},400);
 try{
  const res=await fetch(url+'/rest/v1/rpc/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(params),cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok)return json({error:'queue unavailable'},502);
  return json({data:await res.json()});
 }catch{return json({error:'queue unavailable'},503);}
}
