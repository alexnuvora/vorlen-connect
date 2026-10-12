import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
function authorised(request: NextRequest) {
 const expected=process.env.VORLEN_WORKER_API_TOKEN;
 const presented=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!expected || expected.length<32 || !presented) return false;
 const a=Buffer.from(expected),b=Buffer.from(presented);
 return a.length===b.length && timingSafeEqual(a,b);
}
export async function POST(request: NextRequest) {
 if(!authorised(request)) return Response.json({error:'unauthorised'},{status:401});
 let input: {action?:string;worker_id?:string;id?:string;lease_token?:string;success?:boolean;result?:unknown;error?:string};
 try {input=await request.json();}catch{return Response.json({error:'invalid JSON'},{status:400});}
 if(!['claim','finish'].includes(input.action||''))return Response.json({error:'invalid action'},{status:400});
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return Response.json({error:'backend not configured'},{status:503});
 const path=input.action==='claim'?'vc_worker_claim':'vc_worker_finish';
 const params=input.action==='claim'?{p_worker:input.worker_id}:{
  p_id:input.id,p_lease:input.lease_token,p_success:input.success,p_result:input.result??{},p_error:input.error??null};
 if(input.action==='claim' && (typeof input.worker_id!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(input.worker_id)))return Response.json({error:'invalid worker'},{status:400});
 if(input.action==='finish' && (!/^[0-9a-f-]{36}$/i.test(input.id||'')||!/^[0-9a-f-]{36}$/i.test(input.lease_token||'')||typeof input.success!=='boolean'))return Response.json({error:'invalid lease'},{status:400});
 try{
  const res=await fetch(url+'/rest/v1/rpc/'+path,{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(params),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!res.ok)return Response.json({error:'queue unavailable'},{status:502});
  return Response.json({data:await res.json()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'queue unavailable'},{status:503});}
}
