import {NextRequest} from 'next/server';
import {VorlenService} from '@/lib/linkedin-service.mjs';
import {SupabaseStore} from '@/lib/supabase-store.mjs';
import {schedulerAuthorized,runLinkedInSchedule} from '@/lib/linkedin-scheduler.mjs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const settings=process.env;
 if(!schedulerAuthorized(req.headers.get('authorization'),settings.VORLEN_SCHEDULER_SECRET))return new Response('Unauthorised',{status:401,headers:{'Cache-Control':'no-store'}});
 const owner=settings.ZERNIO_OWNER_ID;
 if(!owner||!settings.CREDENTIAL_ENCRYPTION_KEY||!settings.SUPABASE_URL||!settings.SUPABASE_SERVICE_ROLE_KEY)return new Response('Scheduler not configured',{status:503});
 try{
  const svc=new VorlenService(new SupabaseStore(settings.SUPABASE_URL,settings.SUPABASE_SERVICE_ROLE_KEY,owner),owner,settings.CREDENTIAL_ENCRYPTION_KEY,settings,fetch);
  const result=await runLinkedInSchedule(svc,{probe:req.nextUrl.searchParams.get('probe')==='1'});
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Scheduler could not read its queue. No automatic retry of claimed posts.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
// Supabase Cron is the only scheduler; old Vercel GET triggers cannot publish.
export async function GET(){return new Response('Use authenticated POST.',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});}
