// Read-only job discovery adapter. Provider is Apify; no LinkedIn login or scraping code here.
// An Apify account/API token is required, and costs/coverage depend on the selected Actor.
export const ACTOR = 'worldunboxer~rapid-linkedin-scraper';
const base='https://api.apify.com/v2';
const posted=['Any Time','Past 24 hours','Past Week','Past Month'];
const employment=['Full-time','Part-time','Contract','Temporary','Volunteer','Internship','Other'];
const arrangement=['On-site','Remote','Hybrid'];
const experience=['Intern','Assistant','Junior','Mid-Senior','Director','Executive'];
const str=(v,max=200)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
const strings=(v)=>Array.isArray(v)&&v.length<=20&&v.every(x=>str(x,120))?v.map(x=>x.trim()):null;
export function validateSearch(x={}){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_INPUT: search options must be an object.');
 const allowed=['jobs_titles','location','cities','company_names','jobs_entries','posted_within','employment_type','work_arrangement','experience','easy_apply'];
 if(Object.keys(x).some(k=>!allowed.includes(k)))throw Error('INVALID_INPUT: unknown job-search filter.');
 const o={jobs_entries:50,posted_within:'Past 24 hours'};
 for(const key of ['jobs_titles','cities','company_names'])if(x[key]!==undefined){const value=strings(x[key]);if(!value)throw Error('INVALID_INPUT: invalid '+key);o[key]=value;}
 if(x.location!==undefined){const v=str(x.location);if(!v)throw Error('INVALID_INPUT: invalid location');o.location=v;}
 if(x.jobs_entries!==undefined){if(!Number.isInteger(x.jobs_entries)||x.jobs_entries<10||x.jobs_entries>1000)throw Error('INVALID_INPUT: jobs_entries must be between 10 and 1000.');o.jobs_entries=x.jobs_entries;}
 for(const [key,opts] of [['posted_within',posted],['employment_type',employment],['work_arrangement',arrangement],['experience',experience]])if(x[key]!==undefined){if(!opts.includes(x[key]))throw Error('INVALID_INPUT: invalid '+key);o[key]=x[key];}
 if(x.easy_apply!==undefined){if(typeof x.easy_apply!=='boolean')throw Error('INVALID_INPUT: easy_apply must be boolean');o.easy_apply=x.easy_apply;}
 return o;
}
export function normalizeJob(raw){
 const count=raw.num_applicants??raw.applicants_count;
 const applicants=typeof count==='number'&&Number.isInteger(count)&&count>=0?count:typeof count==='string'&&/^\d+$/.test(count.trim())?Number(count.trim()):null;
 const badge=raw.hiring_badge??raw.hiringBadge??raw.is_hiring??raw.actively_hiring??null;
 const hiring_badge=typeof badge==='boolean'?badge:typeof badge==='string'?(/^(true|yes|actively hiring|hiring)$/i.test(badge.trim())?true:/^(false|no)$/i.test(badge.trim())?false:null):null;
 const age=raw.time_posted??raw.posted_time_ago??null;
 let age_minutes=null;
 if(typeof age==='string'){
 const m=age.trim().match(/^(\d+)\s*(minute|min|hour|hr|day|week|month)s?\s*ago$/i);
 if(m){const scale={minute:1,min:1,hour:60,hr:60,day:1440,week:10080,month:43200};age_minutes=Number(m[1])*scale[m[2].toLowerCase()];}
 else if(/^(just now|moments ago)$/i.test(age.trim()))age_minutes=0;
 }
 return {job_id:raw.job_id??null,job_title:raw.job_title??null,job_url:raw.job_url??null,company_name:raw.company_name??null,company_url:raw.company_url??null,location:raw.location??null,num_applicants:applicants,hiring_badge,time_posted:age,age_minutes,raw};
}
export function filterJobs(jobs,criteria={}){
 if(!criteria||typeof criteria!=='object'||Array.isArray(criteria))throw Error('INVALID_INPUT: invalid match criteria');
 const allowed=['max_applicants','hiring_badge_required','max_age_minutes'];
 if(Object.keys(criteria).some(k=>!allowed.includes(k)))throw Error('INVALID_INPUT: unknown match criterion');
 const {max_applicants,hiring_badge_required,max_age_minutes}=criteria;
 if(max_applicants!==undefined&&(!Number.isInteger(max_applicants)||max_applicants<0||max_applicants>100000))throw Error('INVALID_INPUT: max_applicants');
 if(max_age_minutes!==undefined&&(!Number.isFinite(max_age_minutes)||max_age_minutes<0||max_age_minutes>525600))throw Error('INVALID_INPUT: max_age_minutes');
 if(hiring_badge_required!==undefined&&typeof hiring_badge_required!=='boolean')throw Error('INVALID_INPUT: hiring_badge_required');
 return jobs.map(normalizeJob).filter(j=>(max_applicants===undefined||j.num_applicants!==null&&j.num_applicants<=max_applicants)&&(hiring_badge_required!==true||j.hiring_badge===true)&&(max_age_minutes===undefined||j.age_minutes!==null&&j.age_minutes<=max_age_minutes));
}
async function callApi(path,{method='GET',body,token,fetcher=fetch}={}){
 if(!str(token,2000))throw Error('APIFY_NOT_CONFIGURED: set APIFY_API_TOKEN in the server environment.');
 const url=new URL(base+path);
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),20000);
 try{
 const r=await fetcher(url.toString(),{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:ctrl.signal});
 if(!r.ok)throw Error('APIFY_ERROR: provider returned HTTP '+r.status);
 const payload=await r.json();
 if(!payload||typeof payload!=='object')throw Error('APIFY_ERROR: invalid response');
 return payload.data??payload;
 }finally{clearTimeout(timer);}
}
export async function startJobSearch(options,{token,fetcher}={}){
 const input=validateSearch(options);
 const run=await callApi('/acts/'+ACTOR+'/runs?waitForFinish=0',{method:'POST',body:input,token,fetcher});
 if(typeof run.id!=='string')throw Error('APIFY_ERROR: missing run ID');
 return {run_id:run.id,status:run.status??'RUNNING',source:'apify:'+ACTOR,input,notice:'This starts a metered Apify Actor run. Results may not be complete or instant.'};
}
export async function getJobResults(options,{token,fetcher}={}){
 const {run_id,offset=0,limit=50,criteria={}}=options||{};
 if(!str(run_id,200)||!/^[a-zA-Z0-9_-]+$/.test(run_id))throw Error('INVALID_INPUT: invalid run_id');
 if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_INPUT: invalid pagination');
 const run=await callApi('/actor-runs/'+encodeURIComponent(run_id),{token,fetcher});
 if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status))return {run_id,status:run.status??'RUNNING',items:[],complete:false};
 if(run.status!=='SUCCEEDED')return {run_id,status:run.status,items:[],complete:true};
 if(typeof run.defaultDatasetId!=='string')throw Error('APIFY_ERROR: missing dataset');
 const items=await callApi('/datasets/'+encodeURIComponent(run.defaultDatasetId)+'/items?clean=true&limit='+limit+'&offset='+offset,{token,fetcher});
 if(!Array.isArray(items))throw Error('APIFY_ERROR: invalid dataset response');
 const matched=filterJobs(items,criteria);
 return {run_id,status:run.status,source:'apify:'+ACTOR,offset,returned:items.length,matched:matched.length,items:matched,complete:items.length<limit,unknown_fields_excluded:true};
}
