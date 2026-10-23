import test from 'node:test';
import assert from 'node:assert/strict';
import {auditParity,APIFY_OBSERVED_FIELDS} from '../lib/job-parity.mjs';
test('tracks all 23 fields observed from the Apify job output',()=>assert.equal(APIFY_OBSERVED_FIELDS.length,23));
test('reports missing values accurately and does not claim false parity',()=>{
 const r=auditParity([{job_id:'1',job_title:'Developer',num_applicants:'29 applicants',hiring_badge:'Actively Hiring'}],[{job_id:'1',job_title:'Developer',num_applicants:null,hiring_badge:null}]);
 assert.equal(r.matching_job_ids,1);assert.equal(r.fields.job_title.exact_matches,1);
 assert.equal(r.fields.num_applicants.ours_populated,0);assert.equal(r.fields.hiring_badge.exact_matches,0);
 assert.equal(r.verified_parity,false);
});
test('full identical output passes',()=>{const a={job_id:'12',job_title:'Engineer',hiring_badge:'Actively Hiring'};assert.equal(auditParity([a],[{...a}]).verified_parity,true);});
