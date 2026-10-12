import {service} from '@/lib/server';
import {assertOrigin,boundedBody} from '@/lib/security.mjs';
import {publicError} from '@/lib/service.mjs';
import {brokerAction} from '@/lib/session-broker.mjs';
import {publicConnection} from '@/lib/session-integration.mjs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function handler(req:Request){
 try{
  assertOrigin(req);
  const svc=await service();
  if(req.method==='GET'){
   const r=await svc.db.rpc('session_manage',{action:'list'});
   return reply({success:true,data:r.rows.map(publicConnection)});
  }
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({success:false,error:{message:'JSON required'}},415);
  const body=await boundedBody(req);
  await svc.rate('api',90);
  if(['enqueue','job','jobs','approve','cancel','disconnect','health'].includes(body?.action)){const {action,...args}=body;return reply({success:true,data:await brokerAction(svc,action,args)});}
  if(body?.action==='create' && typeof body.label==='string' && body.label.trim().length>=1 && body.label.length<=100){
   const r=await svc.db.rpc('session_manage',{action:'create',label:body.label.trim()});
   return reply({success:true,data:r.rows[0]},201);
  }
  if(body?.action==='revoke' && typeof body.id==='string' && /^[a-f0-9-]{36}$/i.test(body.id)){
   const r=await svc.db.rpc('session_manage',{action:'revoke',id:body.id});
   return reply({success:true,data:r.rows[0]});
  }
  return reply({success:false,error:{message:'Invalid session operation'}},400);
 }catch(e){const err=publicError(e);return reply({success:false,error:err.error},err.status);}
}
export const GET=handler;export const POST=handler;
