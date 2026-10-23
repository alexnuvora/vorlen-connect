import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSearch,normalizeJob,filterJobs,startJobSearch,getJobResults} from '../lib/job-intelligence.mjs';
test('search validation rejects arbitrary provider inputs',()=>{
 assert.throws(()=>validateSearch({token:'leak'}),/unknown/);
 assert.throws(()=>validateSearch({jobs_entries:10001}),/jobs_entries/);
 assert.equal(validateSearch({location:'Manchester',cities:['Manchester']}).posted_within,'Past 24 hours');
});
test('badge, applicants and age filters fail closed on missing fields',()=>{
 const raw=[{job_id:'1',num_applicants:2,hiring_badge:true,time_posted:'1 minute ago'},
 {job_id:'2',num_applicants:1,time_posted:'1 minute ago'},
 {job_id:'3',num_applicants:0,hiring_badge:true,time_posted:'3 hours ago'},
 {job_id:'4',num_applicants:'Unknown',hiring_badge:true,time_posted:'just now'}];
 const matches=filterJobs(raw,{max_applicants:2,hiring_badge_required:true,max_age_minutes:1});
 assert.deepEqual(matches.map(j=>j.job_id),['1']);
 assert.equal(matches[0].raw.num_applicants,2);
 assert.equal(normalizeJob({time_posted:'2 hours ago'}).age_minutes,120);
});
test('start and retrieve results use bearer token, never place it in URL',async()=>{
 const urls=[], requests=[];
 const fetcher=async(url,opts)=>{urls.push(url);requests.push(opts);if(url.includes('/runs?'))return {ok:true,json:async()=>({data:{id:'abc123',status:'RUNNING'}})};
 if(url.includes('/actor-runs/'))return {ok:true,json:async()=>({data:{status:'SUCCEEDED',defaultDatasetId:'ds123'}})};
 return {ok:true,json:async()=>([{job_id:'1',num_applicants:2,hiring_badge:true,time_posted:'1 minute ago',description:'Full details'}])};};
 const run=await startJobSearch({location:'Manchester',jobs_entries:10},{token:'secret',fetcher});
 assert.equal(run.run_id,'abc123');
 const jobs=await getJobResults({run_id:'abc123',criteria:{hiring_badge_required:true,max_applicants:2,max_age_minutes:1}},{token:'secret',fetcher});
 assert.equal(jobs.matched,1);assert.equal(jobs.items[0].raw.description,'Full details');
 assert.ok(urls.every(u=>!u.includes('secret')));
 assert.ok(requests.every(r=>r.headers.Authorization==='Bearer secret'));
});
test('incomplete runs do not invent result entries',async()=>{
 const data=await getJobResults({run_id:'abc123'},{token:'secret',fetcher:async()=>({ok:true,json:async()=>({data:{status:'RUNNING'}})})});
 assert.equal(data.complete,false);assert.deepEqual(data.items,[]);
});
