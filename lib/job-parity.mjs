export const APIFY_OBSERVED_FIELDS=['job_id','job_url','search_keyword','job_title','company_name','company_url','company_logo_url','location','time_posted','posted_date','hiring_badge','is_actively_hiring','is_early_applicant','num_applicants','salary_range','job_description','job_description_raw_html','contact_email','seniority_level','employment_type','industries','easy_apply','apply_url'];
export function auditParity(reference,actual){
 if(!Array.isArray(reference)||!Array.isArray(actual))throw Error('PARITY_INVALID_DATA');
 const byId=new Map(actual.filter(x=>x?.job_id!=null).map(x=>[String(x.job_id),x]));
 const shared=reference.filter(x=>x?.job_id!=null&&byId.has(String(x.job_id)));
 const fields=Object.fromEntries(APIFY_OBSERVED_FIELDS.map(field=>{
  let observed=0,populated=0,equal=0;
  for(const ref of shared){const a=byId.get(String(ref.job_id));if(ref[field]!==null&&ref[field]!==undefined&&ref[field]!==''){observed++;if(a[field]!==null&&a[field]!==undefined&&a[field]!=='')populated++;if(a[field]===ref[field])equal++;}}
  return [field,{reference_populated:observed,ours_populated:populated,exact_matches:equal}];
 }));
 return {reference_count:reference.length,own_count:actual.length,matching_job_ids:shared.length,reference_jobs_missing:reference.length-shared.length,fields,verified_parity:reference.length>0&&shared.length===reference.length&&Object.values(fields).every(f=>f.exact_matches===f.reference_populated)};
}
