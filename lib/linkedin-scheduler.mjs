import {timingSafeEqual} from 'node:crypto';
export function schedulerAuthorized(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
// A bounded run leaves remaining jobs for the next minute. The database owns
// the permanent per-post publication claim, so overlapping invocations cannot resend.
export async function runLinkedInSchedule(svc,{maxPosts=5,budgetMs=220000,clock=Date.now,probe=false}={}){
 const started=clock();
 const due=(await svc.postStore('due')).rows;
 if(probe)return {checked:due.length,processed:0,probe:true,outcomes:[]};
 const outcomes=[];
 for(const entry of due.slice(0,maxPosts)){
  if(clock()-started>=budgetMs)break;
  try{
   const p=await svc.previewPost(entry.draft_id);
   if(p.review_state!=='scheduled'||!p.scheduled_at||Date.parse(p.scheduled_at)>clock()||!Number.isFinite(Date.parse(p.scheduled_at)))continue;
   const result=await svc.publishApprovedPost(p.draft_id,p.revision);
   outcomes.push({draft_id:p.draft_id,status:result.status});
  }catch(e){outcomes.push({draft_id:entry.draft_id,status:'failed_or_uncertain',error_code:/^[A-Z_]{1,60}$/.test(e?.code||'')?e.code:'SCHEDULER_ERROR'});}
 }
 return {checked:due.length,processed:outcomes.length,outcomes};
}
