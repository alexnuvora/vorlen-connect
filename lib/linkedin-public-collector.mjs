// Vorlen-owned public job parser prototype. No Apify dependency.
// Disabled by default: LinkedIn requires permission for automated extraction.
import {filterJobs,validateSearch} from './job-intelligence.mjs';
const HOST='https://www.linkedin.com';
export const FIELD_NAMES=['job_id','job_url','apply_url','job_title','search_keyword','company_name','company_url','company_logo_url','location','time_posted','posted_date','hiring_badge','is_actively_hiring','is_early_applicant','num_applicants','salary_range','job_description','job_description_raw_html','seniority_level','employment_type','job_function','industries','easy_apply','contact_email'];
const text=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const cap=(s,r)=>String(s||'').match(r)?.[1]||null;
const cl=(s,classname)=>cap(s,new RegExp('<[^>]+class=["\\x27][^"\\x27]*'+classname+'[^"\\x27]*["\\x27][^>]*>([\\s\\S]*?)<\\/[^>]+>','i'));
const url=(s)=>{try{const u=new URL(s,HOST);return ['http:','https:'].includes(u.protocol)?u.toString():null}catch{return null}};
const blank=(id,keyword)=>({...Object.fromEntries(FIELD_NAMES.map(x=>[x,null])),job_id:id,job_url:HOST+'/jobs/view/'+id,search_keyword:keyword});
export function parseSearch(html,keyword=''){const seen=new Set(),out=[];for(const part of String(html||'').split(/(?=<li\b)/i)){const href=cap(part,/<a[^>]+href=["']([^"']*\/jobs\/view\/[^"']+)["']/i);const urn=cap(part,/data-entity-urn=["']urn:li:jobPosting:(\d+)["']/i);const id=(href||urn||'').match(/(\d{6,})/)?.[1];if(!id||seen.has(id))continue;seen.add(id);const j=blank(id,keyword);j.job_url=url(href)||j.job_url;j.job_title=text(cl(part,'base-search-card__title')||cl(part,'job-search-card__title'));j.company_name=text(cl(part,'base-search-card__subtitle')||cl(part,'job-search-card__subtitle'));j.location=text(cl(part,'job-search-card__location'));j.posted_date=cap(part,/<time[^>]+datetime=["']([^"']+)/i);j.time_posted=text(cap(part,/<time[^>]*>([\s\S]*?)<\/time>/i))||null;j.company_logo_url=url(cap(part,/<img[^>]+data-delayed-url=["']([^"']+)/i));out.push(j);}return out;}
function criterion(h,label){const section=h.split(new RegExp('<h3[^>]*>\\s*'+label+'\\s*<\\/h3>','i'))[1];return section?text(cap(section,/<span[^>]*>([\s\S]*?)<\/span>/i)):null}
export function parseDetail(html,card){
 const h=String(html||''),j={...card};
 const body=cl(h,'show-more-less-html__markup')||cl(h,'description__text')||cl(h,'jobs-description-content__text');
 j.job_description_raw_html=body||null;j.job_description=body?text(body):null;
 const title=cl(h,'top-card-layout__title')||cl(h,'topcard__title');if(title)j.job_title=text(title);
 const company=cl(h,'topcard__org-name-link');if(company)j.company_name=text(company);
 j.seniority_level=criterion(h,'Seniority level');j.employment_type=criterion(h,'Employment type');j.job_function=criterion(h,'Job function');j.industries=criterion(h,'Industries');
 const companyHref=cap(h,/<a[^>]+class=["'][^"']*topcard__org-name-link[^"']*["'][^>]*href=["']([^"']+)/i);if(companyHref)j.company_url=url(companyHref);
 const posted=cap(h,/<time[^>]*datetime=["']([^"']+)["']/i);if(posted)j.posted_date=posted;
 const all=text(h);
 j.num_applicants=cap(all,/(\d[\d,]* applicants?)/i)||cap(all,/(Be among the first 25 applicants)/i);
 j.hiring_badge=cap(all,/(Actively Hiring|Be an early applicant)/i);
 j.is_actively_hiring=j.hiring_badge==='Actively Hiring'?true:j.hiring_badge==='Be an early applicant'?false:null;
 j.is_early_applicant=j.hiring_badge==='Be an early applicant'?true:j.hiring_badge==='Actively Hiring'?false:null;
 j.salary_range=cap(all,/((?:£|\$|€)[\d,]+(?:\s*[-–]\s*(?:£|\$|€)?[\d,]+)?(?:\s*per\s*(?:year|hour|month))?)/i);
 j.contact_email=cap(j.job_description,/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
 j.easy_apply=/\bEasy Apply\b/i.test(all)?true:null;
 const applyHref=cap(h,/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*(?:apply-button|apply-link)[^"']*["']/i)||cap(h,/<a[^>]+class=["'][^"']*(?:apply-button|apply-link)[^"']*["'][^>]*href=["']([^"']+)/i);
 j.apply_url=url(applyHref)||j.job_url;return j;
}

async function read(u,fetcher){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetcher(u,{method:'GET',headers:{Accept:'text/html'},redirect:'error',signal:controller.signal});if(r.status===403||r.status===429)throw Error('LINKEDIN_BLOCKED: no retry or circumvention');if(!r.ok)throw Error('LINKEDIN_HTTP_'+r.status);return r.text();}finally{clearTimeout(timer)}}
export async function collectJobs(input,{fetcher=fetch,authorized=false}={}){if(!authorized)throw Error('LINKEDIN_PERMISSION_REQUIRED');const q=validateSearch(input);const found=new Map();for(const title of (q.jobs_titles?.length?q.jobs_titles:['']).slice(0,3)){for(const city of (q.cities?.length?q.cities:[q.location||'']).slice(0,3)){const params=new URLSearchParams({keywords:title,location:city,start:'0'});const tf={'Past 24 hours':'r86400','Past Week':'r604800','Past Month':'r2592000'}[q.posted_within];if(tf)params.set('f_TPR',tf);const cards=parseSearch(await read(HOST+'/jobs-guest/jobs/api/seeMoreJobPostings/search?'+params,fetcher),title);for(const j of cards){if(found.has(j.job_id))continue;if(found.size>=Math.min(q.jobs_entries,100))break;const detail=await read(HOST+'/jobs-guest/jobs/api/jobPosting/'+j.job_id,fetcher);found.set(j.job_id,parseDetail(detail,j));}}}return {source:'vorlen_owned_public_linkedin',items:filterJobs([...found.values()]),returned:found.size,limitations:'Best-effort publicly displayed fields; no guarantee of Apify parity. Requires authorized LinkedIn access.'};}
