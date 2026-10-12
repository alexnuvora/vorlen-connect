import {verifyWorkerRequest} from '@/lib/session-worker-auth.mjs';
import {decrypt,encrypt} from '@/lib/security.mjs';
import {sessionContext} from '@/lib/session-broker.mjs';
import {z} from 'zod';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 try{
  // Read exactly the signed bytes, with a hard cap before parsing.
  const reader=req.body?.getReader();if(!reader)return json({error:'invalid request'},400);
  let length=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>262144){await reader.cancel();return json({error:'too large'},413);}chunks.push(value);}
  const raw=Buffer.concat(chunks);const nonce=verifyWorkerRequest(req.headers,raw,process.env.VORLEN_SESSION_WORKER_PUBLIC_KEY);
  if(!nonce)return json({error:'unauthorised'},401);
  const owner=process.env.ZERNIO_OWNER_ID,key=process.env.CREDENTIAL_ENCRYPTION_KEY,url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!owner||!key||!url||!serviceKey)return json({error:'not configured'},503);
  const input=z.object({action:z.enum(['claim','finish']),version:z.string().max(80),id:z.string().uuid().optional(),lease_token:z.string().uuid().optional(),result:z.record(z.unknown()).optional()}).strict().parse(JSON.parse(raw.toString()));
  const p:Record<string,unknown>={nonce,version:input.version};
  if(input.action==='finish'){
   if(!input.id||!input.lease_token||!input.result)return json({error:'invalid completion'},400);
   const r=z.object({ok:z.boolean(),error_code:z.string().regex(/^[A-Z_]{1,80}$/).optional(),connection_state:z.enum(['connected','verification_required','error']).optional(),verification_kind:z.enum(['email','totp','push','captcha','other']).optional(),reference:z.string().regex(/^[a-f0-9]{64}$/).optional(),profile_id:z.string().min(1).max(300).optional(),expires_at:z.string().datetime().optional(),data:z.unknown().optional()}).strict().parse(input.result);
   Object.assign(p,{...r,data:undefined,id:input.id,lease_token:input.lease_token,encrypted_result:await encrypt(JSON.stringify(r),key,sessionContext(owner,input.id)+':result')});
  }
  const response=await fetch(url+'/rest/v1/rpc/vc_session_worker',{method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({p_action:input.action,p_owner:owner,p}),signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
  if(!response.ok)return json({error:'worker operation rejected'},409);
  const result=z.object({rows:z.array(z.record(z.string())),changes:z.number(),connections:z.array(z.string().uuid())}).parse(await response.json());
  if(input.action==='claim'){
   const rows=await Promise.all(result.rows.map(async (row:Record<string,string>)=>{const {encrypted_input,...publicRow}=row;return {...publicRow,input:JSON.parse(await decrypt(encrypted_input,key,sessionContext(owner,row.id)))};}));
  }
  return json({data:{...result,owner_id:owner}});
 }catch{return json({error:'worker request failed'},400);}
}
