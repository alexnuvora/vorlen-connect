import {z} from 'zod';
import {publicConnection} from './session-integration.mjs';
import {encrypt,decrypt,hash,uid,fail,linkedinId} from './security.mjs';
export const SESSION_READS=['profile','inbox','conversation','invitations','connections','search_people','recruiter'];
export const SESSION_WRITES=['send_message','send_invitation'];
const ident=z.string().min(1).max(300).regex(/^[\p{L}\p{N}_:().,-]+$/u);
const page=z.object({start:z.number().int().min(0).max(1000).default(0),count:z.number().int().min(1).max(25).default(10)}).strict();
export function validateSessionInput(operation,input){
 const schemas={
  connect:z.object({email:z.string().email().max(254),password:z.string().min(1).max(1000)}).strict(),
  import:z.object({li_at:z.string().min(10).max(4000).regex(/^[^\s;\r\n]+$/),jsessionid:z.string().min(3).max(300).regex(/^[^;\r\n]+$/)}).strict(),
  verify:z.object({code:z.string().regex(/^[a-zA-Z0-9 -]{4,16}$/)}).strict(),
  refresh:z.object({}).strict(),profile:z.object({identifier:ident.optional()}).strict(),
  inbox:page,invitations:page,connections:page,
  conversation:page.extend({conversation_id:ident}).strict(),
  search_people:page.extend({keywords:z.string().trim().min(1).max(200)}).strict(),
  recruiter:z.object({}).strict(),
  send_message:z.object({conversation_id:ident,content:z.string().trim().min(1).max(3000)}).strict(),
  send_invitation:z.object({identifier:z.string().min(1).max(1000),content:z.string().trim().max(200).default('')}).strict(),
 };
 if(!schemas[operation])fail('UNKNOWN_OPERATION','Unknown session operation.',400);
 const parsed=schemas[operation].parse(input);
 if(operation==='send_invitation')parsed.identifier=linkedinId(parsed.identifier);
 return parsed;
}
export const sessionContext=(owner,id)=>'vorlen-session-job:'+owner+':'+id;
export async function brokerAction(svc,action,args={}){
 const rpc=(a,p={})=>svc.db.rpc('session_broker',{action:a,...p});
 await svc.rate('session',90);
 if(action==='list')return (await svc.db.rpc('session_manage',{action:'list'})).rows.map(publicConnection);
 if(action==='health')return (await rpc('health')).rows[0]||null;
 if(action==='jobs')return (await rpc('jobs')).rows;
 if(action==='job'){
  const {id}=z.object({id:z.string().uuid()}).strict().parse(args);
  const row=(await rpc('job',{id})).rows[0];if(!row)fail('NOT_FOUND','Session job not found.',404);
  const {encrypted_result,...safe}=row;
  if(encrypted_result)safe.result=JSON.parse(await decrypt(encrypted_result,svc.secret,sessionContext(svc.owner,id)+':result'));
  return safe;
 }
 if(['approve','cancel'].includes(action)){
  const p=z.object({id:z.string().uuid(),content_hash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(args);
  if(action==='approve'&&!p.content_hash)fail('APPROVAL_REQUIRED','Review the exact draft and provide its content hash.',400);
  if(action==='approve'){
   const j=(await rpc('job',{id:p.id})).rows[0];
   if(j?.operation==='send_invitation'&&await svc.isSuppressed('linkedin:'+j.public_input.identifier.toLowerCase()))fail('RECIPIENT_SUPPRESSED','Recipient is suppressed.',409);
   await svc.rate('session_send',5);
  }
  return (await rpc(action,p)).rows[0];
 }
 if(action==='disconnect'){
  const p=z.object({connection_id:z.string().uuid()}).strict().parse(args);return (await rpc(action,p)).rows[0];
 }
 if(action==='enqueue'){
  const p=z.object({connection_id:z.string().uuid(),operation:z.string(),input:z.record(z.unknown()).default({})}).strict().parse(args);
  const data=validateSessionInput(p.operation,p.input);
  const id=uid();const context=sessionContext(svc.owner,id);
  const content_hash=await hash({connection_id:p.connection_id,operation:p.operation,input:data});
  const secretInput=['connect','import','verify'].includes(p.operation);
  const r=await rpc('enqueue',{id,connection_id:p.connection_id,operation:p.operation,content_hash,
   encrypted_input:await encrypt(JSON.stringify(data),svc.secret,context),public_input:secretInput?{}:data});
  return {...r.rows[0],connection_id:p.connection_id,operation:p.operation,
   next_step:SESSION_WRITES.includes(p.operation)?'Review recipient and exact text with job, then approve the content_hash.': 'Poll job for the result.'};
 }
 fail('UNKNOWN_OPERATION','Unknown session action.',400);
}
