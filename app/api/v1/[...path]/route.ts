import { service } from '@/lib/server';
import { assertOrigin,boundedBody,fail } from '@/lib/security.mjs';
import { publicError } from '@/lib/service.mjs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function handle(req:Request){try{
 assertOrigin(req);const svc=await service();const path=new URL(req.url).pathname.replace('/api/v1/','');
 if(req.method==='GET'){if(path==='linkedin/status')return json(await svc.linkedinStatus());if(path==='dashboard')return json(await svc.dashboard());if(path==='capabilities')return json(await svc.capabilities());fail('NOT_FOUND','Route not found.',404);}
 if(!req.headers.get('content-type')?.includes('application/json'))fail('INVALID_CONTENT_TYPE','Use application/json.',415);
 const body=await boundedBody(req);await svc.rate('api',90);let data;
 switch(path){
 case 'linkedin/app':data=await svc.saveLinkedinApp(body);break;
 case 'linkedin/disconnect':data=await svc.disconnectLinkedin(body.id);break;
 case 'linkedin/start':{const r=await svc.startLinkedin();return Response.json({success:true,data:{url:r.url}},{headers:{'Cache-Control':'private, no-store','Set-Cookie':'__Host-vorlen-li='+r.binding+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600'}});}
 case 'call':data=await svc.call(body.operation,body.arguments||{});break;
 case 'providers/save':data=await svc.saveProvider(body);break;
 case 'providers/remove':data=await svc.removeProvider(body.provider);break;
 case 'accounts/connect':data=await svc.connect(body.platform,new URL(req.url).origin,body.profile_id);break;
 case 'drafts/send':data=await svc.sendDraft(body.id);break;
 case 'drafts/cancel':data=await svc.cancelDraft(body.id);break;
 case 'contacts/save':data=await svc.saveContact(body);break;
 case 'contacts/delete':data=await svc.deleteContact(body.id);break;
 case 'suppressions/add':data=await svc.suppress(body);break;
 default:fail('NOT_FOUND','Route not found.',404);
 }return json({success:true,data});
 }catch(e){const r=publicError(e);return json({success:false,error:r.error},r.status);}}
export const GET=handle;
export const POST=handle;
