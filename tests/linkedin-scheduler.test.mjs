import test from 'node:test';import assert from 'node:assert/strict';
import {schedulerAuthorized,runLinkedInSchedule} from '../lib/linkedin-scheduler.mjs';
const secret='ab'.repeat(32);
test('scheduler requires its exact dedicated secret and fails closed when absent',()=>{
 assert.equal(schedulerAuthorized('Bearer '+secret,secret),true);
 for(const header of [null,'','Bearer wrong','Bearer '+secret+'x','Basic '+secret])assert.equal(schedulerAuthorized(header,secret),false);
 assert.equal(schedulerAuthorized('Bearer undefined',undefined),false);
});
function fixture(states){const sent=[];return {sent,svc:{postStore:async()=>({rows:Object.keys(states).map(draft_id=>({draft_id}))}),previewPost:async id=>({...states[id],draft_id:id,revision:3}),publishApprovedPost:async(id,revision)=>{sent.push({id,revision});return {status:'published'};}}};}
test('only still-scheduled and due approvals reach the publishing claim',async()=>{
 const {svc,sent}=fixture({due:{review_state:'scheduled',scheduled_at:'2026-01-01T00:00:00Z'},future:{review_state:'scheduled',scheduled_at:'2030-01-01T00:00:00Z'},edited:{review_state:'pending',scheduled_at:'2026-01-01T00:00:00Z'},claimed:{review_state:'publishing',scheduled_at:null},invalid:{review_state:'scheduled',scheduled_at:'bad'}});
 await runLinkedInSchedule(svc,{clock:()=>Date.parse('2026-10-12T00:00:00Z')});assert.deepEqual(sent,[{id:'due',revision:3}]);
});
test('probe reads queue but cannot publish; worker caps each batch',async()=>{
 const states=Object.fromEntries(Array.from({length:12},(_,n)=>['d'+n,{review_state:'scheduled',scheduled_at:'2026-01-01T00:00:00Z'}]));const {svc,sent}=fixture(states);
 assert.equal((await runLinkedInSchedule(svc,{probe:true})).checked,12);assert.equal(sent.length,0);
 await runLinkedInSchedule(svc);assert.equal(sent.length,5);
});
test('uncertain outcomes are not retried and raw provider errors are not returned',async()=>{
 const {svc}=fixture({due:{review_state:'scheduled',scheduled_at:'2026-01-01T00:00:00Z'}});let count=0;svc.publishApprovedPost=async()=>{count++;throw Error('PRIVATE_PROVIDER_TOKEN');};
 const result=await runLinkedInSchedule(svc);assert.equal(count,1);assert.equal(result.outcomes[0].status,'failed_or_uncertain');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
