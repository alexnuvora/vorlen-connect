import {NextRequest} from 'next/server';
import {VorlenService} from '@/lib/linkedin-service.mjs';
import {SupabaseStore} from '@/lib/supabase-store.mjs';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)return new Response('Unauthorised',{status:401});
 const settings=process.env;
 const owner=settings.ZERNIO_OWNER_ID;
 if(!owner||!settings.CREDENTIAL_ENCRYPTION_KEY||!settings.SUPABASE_URL||!settings.SUPABASE_SERVICE_ROLE_KEY)return new Response('Scheduler not configured',{status:503});
 const svc=new VorlenService(new SupabaseStore(settings.SUPABASE_URL,settings.SUPABASE_SERVICE_ROLE_KEY,owner),owner,settings.CREDENTIAL_ENCRYPTION_KEY,fetch);
 const due=(await svc.postStore('due')).rows;
 const outcomes=[];
 for(const entry of due){
  try{
   const p=await svc.previewPost(entry.draft_id);
   if(p.review_state!=='scheduled'||!p.scheduled_at||Date.parse(p.scheduled_at)>Date.now())continue;
   const result=await svc.publishApprovedPost(p.draft_id,p.revision);
   outcomes.push({draft_id:p.draft_id,status:result.status});
  }catch{outcomes.push({draft_id:entry.draft_id,status:'failed_or_uncertain'});}
 }
 return Response.json({checked:due.length,processed:outcomes.length,outcomes},{headers:{'Cache-Control':'no-store'}});
}
