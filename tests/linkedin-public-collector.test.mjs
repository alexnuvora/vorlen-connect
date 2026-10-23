import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD_NAMES,parseSearch,parseDetail,collectJobs} from '../lib/linkedin-public-collector.mjs';
const card='<li><div data-entity-urn="urn:li:jobPosting:1234567890"><a href="https://www.linkedin.com/jobs/view/1234567890/"><h3 class="base-search-card__title">Software Engineer</h3></a><h4 class="base-search-card__subtitle">Example Ltd</h4><span class="job-search-card__location">Manchester, England</span><time datetime="2026-10-23">2 hours ago</time></div></li>';
const detail='<div class="show-more-less-html__markup"><p>Build software. careers@example.co.uk</p></div><div>Actively Hiring</div><div>29 applicants</div><div>£55,000 - £70,000 per year</div>';
test('search parses LinkedIn public card and exact job ID',()=>{const rows=parseSearch(card,'Software');assert.equal(rows.length,1);assert.equal(rows[0].job_id,'1234567890');assert.equal(rows[0].company_name,'Example Ltd');assert.equal(rows[0].location,'Manchester, England');});
test('detail parser preserves full Apify-compatible field contract',()=>{const j=parseDetail(detail,parseSearch(card)[0]);assert.deepEqual(FIELD_NAMES.filter(k=>!(k in j)),[]);assert.equal(j.hiring_badge,'Actively Hiring');assert.equal(j.is_actively_hiring,true);assert.equal(j.num_applicants,'29 applicants');assert.equal(j.contact_email,'careers@example.co.uk');assert.equal(j.job_description,'Build software. careers@example.co.uk');});
test('native collector attempts publicly accessible source without custom permission flag',async()=>{let called=false;await assert.rejects(collectJobs({jobs_titles:['Software']},{fetcher:()=>{called=true;throw Error('network failure');}}),/network failure/);assert.equal(called,true);});
test('own collection uses fixed public paths and returns matching results',async()=>{const calls=[];const fetcher=async(path)=>{calls.push(path);return{ok:true,status:200,text:async()=>path.includes('jobPosting')?detail:path.includes('start=10')?'':card};};const data=await collectJobs({jobs_titles:['Software'],cities:['Manchester'],jobs_entries:10},{fetcher,authorized:true});assert.equal(data.returned,1);assert.equal(data.items[0].hiring_badge,true);assert.equal(data.items[0].num_applicants,29);assert.equal(calls.length,3);assert.ok(calls.every(c=>c.startsWith('https://www.linkedin.com/jobs-guest/')));});
test('source denial stops collection without retries',async()=>{let n=0;const fetcher=async()=>{n++;return{ok:false,status:429}};await assert.rejects(collectJobs({jobs_entries:10},{fetcher,authorized:true}),/SOURCE_ACCESS_RESTRICTED/);assert.equal(n,1);});

test('additional LinkedIn fields are parsed from detail HTML',()=>{
 const html='<a class="topcard__org-name-link" href="/company/example-ltd">Example Ltd</a><h3>Seniority level</h3><span>Mid-Senior level</span><h3>Employment type</h3><span>Full-time</span><h3>Job function</h3><span>Engineering</span><h3>Industries</h3><span>Technology</span><a class="apply-button" href="https://example.com/apply">Apply</a><time datetime="2026-10-23"></time><p>£60,000 - £75,000 per year</p>';
 const j=parseDetail(html,parseSearch(card)[0]);
 assert.equal(j.seniority_level,'Mid-Senior level');
 assert.equal(j.employment_type,'Full-time');
 assert.equal(j.job_function,'Engineering');
 assert.equal(j.industries,'Technology');
 assert.equal(j.company_url,'https://www.linkedin.com/company/example-ltd');
 assert.equal(j.apply_url,'https://example.com/apply');
 assert.equal(j.posted_date,'2026-10-23');
 assert.match(j.salary_range,/£60,000/);
});

test('application URL stays unknown when source only provides job-view URL',()=>{const cardRow=parseSearch(card)[0];const job=parseDetail('<div class="show-more-less-html__markup"><p>Role</p></div>',cardRow);assert.equal(job.apply_url,null);assert.ok(job.job_url.includes('1234567890'));});

test('guest search paginates with start=10, deduplicates and preserves full output',async()=>{
 const second=card.replaceAll('1234567890','1234567891').replace('Software Engineer','Senior Software Engineer');
 const urls=[];
 const fetcher=async(path)=>{urls.push(path);let html='';
  if(path.includes('jobPosting'))html=detail;
  else if(path.includes('start=0'))html=card;
  else if(path.includes('start=10'))html=card+second;
  return {ok:true,status:200,text:async()=>html};
 };
 const result=await collectJobs({jobs_titles:['Software Engineer'],cities:['Manchester'],jobs_entries:10},{fetcher});
 assert.equal(result.returned,2);
 assert.equal(result.pages_fetched,3);
 assert.equal(result.items[1].job_id,'1234567891');
 assert.equal(urls.filter(x=>x.includes('start=10')).length,1);
 assert.equal(urls.filter(x=>x.includes('jobPosting')).length,2);
});

test('regressions: preserve multi-paragraph descriptions, attribute order and qualified applicant counts',()=>{
 const html='<div class="show-more-less-html__markup"><p>First paragraph.</p><p>Second paragraph includes contact@example.co.uk.</p></div><a href="/company/example-ltd" class="topcard__org-name-link">Example Ltd</a><div>Over 200 applicants</div>';
 const j=parseDetail(html,parseSearch(card)[0]);
 assert.match(j.job_description,/First paragraph/);
 assert.match(j.job_description,/Second paragraph includes contact@example.co.uk/);
 assert.equal(j.contact_email,'contact@example.co.uk');
 assert.equal(j.company_url,'https://www.linkedin.com/company/example-ltd');
 assert.equal(j.num_applicants,'Over 200 applicants');
});
