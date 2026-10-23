import test from 'node:test';
import assert from 'node:assert/strict';
import {startNativeSearch,getNativeResults} from '../lib/native-jobs.mjs';
const env={JOBS_GREENHOUSE_BOARDS:'examplejobs',JOBS_RUN_SIGNING_KEY:'test-secret-has-more-than-thirty-two-characters'};
const fetcher=async(url,init)=>{assert.match(url,/^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/examplejobs\/jobs\?content=true$/);assert.equal(init.redirect,'error');return {ok:true,json:async()=>({jobs:[{id:4,title:'Software Engineer',absolute_url:'https://boards.greenhouse.io/examplejobs/jobs/4',location:{name:'Manchester, UK'},content:'<p>Build software</p>',updated_at:'2026-10-23T02:00:00Z'},{id:5,title:'Sales Lead',absolute_url:'https://boards.greenhouse.io/examplejobs/jobs/5',location:{name:'London, UK'}}]})};};
test('native collector signs search ID and filters owned board feed',async()=>{
 const s=await startNativeSearch({jobs_titles:['Software'],cities:['Manchester'],posted_within:'Any Time',jobs_entries:10},{env});
 assert.equal(s.source,'vorlen_native_greenhouse');assert.match(s.run_id,/^native1\./);
 const r=await getNativeResults({run_id:s.run_id,limit:10},{env,fetcher});
 assert.equal(r.matched,1);assert.equal(r.items[0].job_title,'Software Engineer');assert.equal(r.items[0].num_applicants,null);assert.equal(r.items[0].hiring_badge,null);assert.equal(r.items[0].raw.job_description,'Build software');
});
test('unknown LinkedIn-only fields fail closed',async()=>{
 const s=await startNativeSearch({jobs_entries:10},{env});
 const r=await getNativeResults({run_id:s.run_id,criteria:{hiring_badge_required:true,max_applicants:2}},{env,fetcher});
 assert.equal(r.matched,0);
});
test('configuration, access and tampered tokens fail closed',async()=>{
 await assert.rejects(startNativeSearch({jobs_entries:10},{env:{JOBS_RUN_SIGNING_KEY:env.JOBS_RUN_SIGNING_KEY}}),/JOBS_BOARDS_NOT_CONFIGURED/);
 await assert.rejects(startNativeSearch({posted_within:'Past 24 hours'},{env}),/UNSUPPORTED_NATIVE_FILTER/);
 const s=await startNativeSearch({jobs_entries:10},{env});
 await assert.rejects(getNativeResults({run_id:s.run_id.slice(0,-5)+'abcde'},{env,fetcher}),/INVALID_RUN_SIGNATURE/);
});
