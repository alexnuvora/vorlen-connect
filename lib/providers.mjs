import {AppError,fail,linkedinId,unipileOrigin,from64} from './security.mjs';
const enc=encodeURIComponent;
const required=(p,k)=>{if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>1000)fail('INVALID_INPUT',`${k} is required (maximum 1000 characters).`);return p[k];};
const list=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const words=v=>list(v).map(x=>String(x)).join(' OR ');
function publicAccount(a){return {id:a.id,name:a.name,type:a.type,created_at:a.created_at,sources:(a.sources||[]).map(s=>({id:s.id,status:s.status})),status:a.status};}
function only(p,allowed){const extra=Object.keys(p).filter(k=>!allowed.includes(k));if(extra.length)fail('UNSUPPORTED_PARAMETER',`This adapter does not support: ${extra.join(', ')}. No filters were silently dropped.`);}
function page(p,max=100){if(p.offset)fail('UNSUPPORTED_PARAMETER','Use the returned cursor for pagination; offsets are not supported.');const n=p.count??p.limit??20;if(!Number.isInteger(n)||n<1||n>max)fail('INVALID_INPUT',`Page size must be between 1 and ${max}.`);return {limit:n,cursor:p.cursor};}
function postId(value){if(typeof value!=='string')fail('INVALID_INPUT','post_url or post_id is required.');if(value.includes('://')){const u=new URL(value);if(!/(^|\.)linkedin\.com$/.test(u.hostname))fail('INVALID_INPUT','Use a LinkedIn post URL.');const m=value.match(/(?:activity-|activity:|ugcPost:)(\d+)/);if(!m)fail('INVALID_INPUT','Cannot identify this post. Supply its provider post_id.');return `urn:li:activity:${m[1]}`;}return value;}
export async function providerRequest(config,path,{query={},method='GET',body,fetcher=fetch,binary=false,idempotencyKey}={}){
 const base=config.provider==='unipile'?unipileOrigin(config.base_url)+'/api/v1/':'https://api.hunter.io/v2/';
 const u=new URL(base+path);for(const [k,v]of Object.entries(query))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
 const headers={'X-API-KEY':config.key,Accept:binary?'application/pdf,application/octet-stream':'application/json'};
 if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
 let payload;if(body instanceof FormData)payload=body;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 let response;try{response=await fetcher(u,{method,headers,body:payload,redirect:'manual',signal:AbortSignal.timeout(25000)});}catch{fail('PROVIDER_UNREACHABLE','The provider did not return a confirmed result. Outgoing actions are not retried automatically.',502);}
 if(!response.ok){const retry=response.headers.get('retry-after');fail(response.status===429?'PROVIDER_RATE_LIMIT':'PROVIDER_ERROR',`Provider returned HTTP ${response.status}. Check the account connection and plan in Connections.`,response.status===429?429:502,{upstream_status:response.status,...(retry?{retry_after:retry}:{})});}
 if(binary){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>4*1024*1024)fail('RESPONSE_TOO_LARGE','CV exceeds the 4 MB response limit.',413);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.slice(i,i+8192));return {data:btoa(s),encoding:'base64',mime_type:response.headers.get('content-type')||'application/octet-stream'};}
 const raw=await response.text();if(raw.length>4*1024*1024)fail('RESPONSE_TOO_LARGE','Provider response exceeds 4 MB. Request fewer records.',502);
 let data;try{data=raw?JSON.parse(raw):{};}catch{fail('PROVIDER_PROTOCOL','Provider returned an unexpected response.',502);}
 if(data.errors||data.error||data.success===false)fail('PROVIDER_ERROR','The provider reported a failed operation.',502);
 if(response.status===202)return {status:'pending',data};return data;
}
export async function runProvider(op,args,config,fetcher=fetch){
 const [group,action]=op.split('.');const p=args.params||{};
 const req=(path,options={})=>providerRequest(config,path,{fetcher,...options});
 if(config.provider==='hunter'){
   if(op==='credits.get')return req('account');
   if(group!=='enrich')fail('WRONG_PROVIDER','This operation requires the LinkedIn/mail provider.');
   if(action==='validate_email'||action==='reverse_email'){
     only(p,['email']);const email=required(p,'email');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('INVALID_INPUT','Enter a valid email address.');
     return req(action==='validate_email'?'email-verifier':'people/find',{query:{email}});
   }
   if(action==='enrich_company'){
     only(p,['company_domain','company_url']);let domain=p.company_domain;
     if(!domain){const u=new URL(required(p,'company_url'));if(/linkedin\.com$/.test(u.hostname))fail('UNSUPPORTED_PARAMETER','Hunter company enrichment needs the company website domain.');domain=u.hostname;}
     return req('companies/find',{query:{domain}});
   }
   if(action==='find_email'||action==='enrich_person'){
     only(p,['first_name','last_name','company_name','company_domain','linkedin_url']);
     const query=p.linkedin_url?{linkedin_handle:linkedinId(p.linkedin_url)}:{first_name:required(p,'first_name'),last_name:required(p,'last_name'),...(p.company_domain?{domain:p.company_domain}:{company:required(p,'company_name')})};
     const found=await req('email-finder',{query});
     if(action==='find_email')return found;
     if(!found.data?.email)return {data:null,reason:'No professional email found; person enrichment was not guessed.'};
     const enriched=await req('people/find',{query:{email:found.data.email}});return {data:enriched.data,email_evidence:found.data};
   }
   fail('NOT_IMPLEMENTED','This enrichment operation needs a different provider adapter.',501);
 }
 let account=args.account_id;
 if(op==='accounts.list'){if(args.include_seats)fail('UNSUPPORTED_PARAMETER','Separate recruiter seat enumeration is not implemented.');const response=await req('accounts',{query:{limit:100,cursor:args.cursor}});return {...response,items:(response.items||[]).map(publicAccount)};}
 if(op==='account.get')return publicAccount(await req('accounts/'+enc(required(args,'account_id'))));
 if(!account&&['emails','send_email','enrich'].includes(group)){
   const all=await req('accounts',{query:{limit:100}});const candidates=(all.items||[]).filter(a=>group==='enrich'?a.type==='LINKEDIN':['MAIL','GOOGLE_OAUTH','GOOGLE','OUTLOOK','IMAP'].includes(a.type));
   if(candidates.length!==1||all.cursor)fail('ACCOUNT_REQUIRED','Choose an explicit account_id from list_accounts.');account=candidates[0].id;
 }
 if(!account||typeof account!=='string')fail('ACCOUNT_REQUIRED','Choose a connected account_id.');
 const q={account_id:account};
 const profile=id=>req('users/'+enc(linkedinId(id)),{query:q});
 const profileId=async id=>{const data=await profile(id);if(!data.provider_id)fail('PROVIDER_PROTOCOL','Profile did not contain a provider_id.',502);return data.provider_id;};
 if(group==='profiles'){
   if(action==='get_me'){only(p,[]);return req('users/me',{query:q});}
   if(action==='get'||action==='get_contact'){only(p,['profile_url','identifier','profile_urn']);return profile(p.profile_url||p.identifier||p.profile_urn);}
   if(action==='get_company'){only(p,['company_url']);return req('linkedin/company/'+enc(linkedinId(required(p,'company_url'),'company')),{query:q});}
   if(action==='get_reactions'||action==='get_comments'){only(p,['profile_url','count','limit','cursor','offset']);return req('users/'+enc(linkedinId(required(p,'profile_url')))+'/'+(action==='get_reactions'?'reactions':'comments'),{query:{...q,...page(p)}});}
 }
 if(group==='network'){
   const routes={list_connections:'users/relations',list_invitations:'users/invite/received',list_sent:'users/invite/sent'};
   if(routes[action]){only(p,['count','limit','cursor','offset']);return req(routes[action],{query:{...q,...page(p)}});}
 }
 if(group==='profiles'&&action.startsWith('search_')||op==='content.search'||op==='enrich.extract_employees'||op==='enrich.search_jobs'){
   const category=op==='enrich.search_jobs'?'jobs':op==='content.search'?'posts':action==='search_companies'?'companies':'people';
   const filters={people:['keyword','company_url','company_name','current_company','first_name','last_name','title','industry','school_url','network'],companies:['keyword','sector','industry','company_size','network'],posts:['keyword','sort_by','post_date','post_type'],jobs:['keywords','is_remote','job_type','country']};
   only(p,[...filters[category],'location','offset','limit','count','cursor']);
   if(category==='posts'&&p.location)fail('UNSUPPORTED_PARAMETER','Location filtering is not available for post search.');
   const body={api:'classic',category};
   if(p.keyword||p.keywords)body.keywords=words(p.keyword||p.keywords);
   async function ids(type,values){const out=[];for(const name of list(values)){if(/^\d+$/.test(String(name))){out.push(String(name));continue;}const search=await req('linkedin/search/parameters',{query:{...q,type,keywords:String(name),limit:10}});const exact=(search.items||[]).filter(x=>String(x.title||x.name||'').toLowerCase()===String(name).toLowerCase());if(exact.length!==1)fail('FILTER_NEEDS_ID',`Cannot unambiguously resolve ${type.toLowerCase()} "${name}". Use the exact LinkedIn numeric filter ID.`,422);out.push(String(exact[0].id));}return out;}
   if(p.location)body.location=await ids('LOCATION',p.location);
   if(category==='people'||category==='companies'){
     if(p.industry||p.sector)body.industry=await ids('INDUSTRY',p.industry||p.sector);
     if(p.network){if(!['F','S','O'].includes(p.network))fail('INVALID_INPUT','network must be F, S or O.');body.network_distance=[{F:1,S:2,O:3}[p.network]];}
   }
   if(category==='people'){
     const advanced={};for(const key of ['first_name','last_name','title'])if(p[key])advanced[key]=words(p[key]);if(p.company_name)advanced.company=words(p.company_name);if(Object.keys(advanced).length)body.advanced_keywords=advanced;
     if(p.company_url){body.company=[];for(const url of list(p.company_url)){const co=await req('linkedin/company/'+enc(linkedinId(url,'company')),{query:q});if(!co.id&&!co.provider_id)fail('PROVIDER_PROTOCOL','Company ID is missing.',502);body.company.push(String(co.id||co.provider_id));}}
     else if(p.current_company)body.company=await ids('COMPANY',p.current_company);
     if(p.school_url)fail('UNSUPPORTED_PARAMETER','school_url mapping is not implemented.');
   }
   if(category==='companies'&&p.company_size){body.headcount=list(p.company_size).map(s=>{const m=String(s).match(/^(\d+)(?:-(\d+)|\+)$/);if(!m)fail('INVALID_INPUT','Invalid company size range.');return {min:Number(m[1]),...(m[2]?{max:Number(m[2])}:{})};});}
   if(category==='posts'){
     if(p.sort_by){if(!['relevance','date'].includes(p.sort_by))fail('INVALID_INPUT','sort_by must be relevance or date.');body.sort_by=p.sort_by;}
     if(p.post_date)body.date_posted=p.post_date;if(p.post_type)body.content_type=p.post_type;
   }
   if(category==='jobs'&&(p.is_remote!==undefined||p.job_type||p.country))fail('UNSUPPORTED_PARAMETER','Job country, remote and contract-type filters need further mapping. Use location and keywords.');
   const paging=page(p,100);paging.limit=Math.min(paging.limit,category==='jobs'?50:category==='posts'?49:10);
   return req('linkedin/search',{method:'POST',query:{...q,...paging},body});
 }
 if(group==='recruiter'||op==='profiles.get_candidates'){
   if(action==='get_cv'){only(p,['application_id']);return req('linkedin/jobs/applicants/'+enc(required(p,'application_id'))+'/resume',{query:q,binary:true});}
   if(action==='get_candidates'){only(p,['job_id','count','limit','total_results','cursor','offset']);if(p.total_results)fail('UNSUPPORTED_PARAMETER','Use limit and cursor instead of total_results.');return req('linkedin/jobs/'+enc(required(p,'job_id'))+'/applicants',{query:{...q,...page(p)}});}
   if(action==='get_posts'){only(p,['job_id','count','limit','cursor','offset','fetch_details']);if(p.fetch_details)fail('UNSUPPORTED_PARAMETER','Fetch a job_id individually for details.');return req(p.job_id?'linkedin/jobs/'+enc(p.job_id):'linkedin/jobs',{query:{...q,...(p.job_id?{service:'CLASSIC'}:page(p))}});}
 }
 if(group==='content'&&['get_comments','get_reactions'].includes(action)){only(p,['post_url','post_id','count','limit','cursor','offset']);return req('posts/'+enc(postId(p.post_id||p.post_url))+'/'+(action==='get_comments'?'comments':'reactions'),{query:{...q,...page(p)}});}
 if(group==='messages'){
   if(args.category&&!['INBOX','UNREAD'].includes(args.category))fail('UNSUPPORTED_PARAMETER','This adapter supports INBOX or UNREAD.');
   return req('chats',{query:{...q,...page(args),...(args.category==='UNREAD'?{unread:true}:{})}});
 }
 if(group==='conversation'){
   const id=required(args,'conversation_id');const chat=await req('chats/'+enc(id),{query:q});if(chat.account_id!==account)fail('ACCOUNT_MISMATCH','Conversation does not belong to the selected account.',403);
   return req('chats/'+enc(id)+'/messages',{query:page(args)});
 }
 if(group==='emails'){
   if(args.unread_only)fail('UNSUPPORTED_PARAMETER','Unread-only mail filtering is not yet supported.');
   return req('emails',{query:{...q,folder:'INBOX',...page(args)}});
 }
 if(group==='send_connection'){return req('users/invite',{method:'POST',body:{account_id:account,provider_id:await profileId(args.profile_url||args.identifier),...(args.message?{message:args.message}:{})}});}
 if(group==='send_message'){
   if(args.media_link)fail('UNSUPPORTED_PARAMETER','Use a base64 media_file; remote attachments are not downloaded.');
   const form=new FormData();form.set('account_id',account);form.append('attendees_ids',await profileId(args.profile_url));form.set('text',args.message_text);
   if(args.media_file){const bytes=from64(args.media_file.data);form.append('attachments',new Blob([bytes]),args.media_file.filename);}
   return req('chats',{method:'POST',body:form});
 }
 if(group==='send_email'){
   const form=new FormData();form.set('account_id',account);form.set('to',JSON.stringify([{identifier:args.to}]));form.set('subject',args.subject);form.set('body',args.html||args.text);
   const custom=[{name:'Content-Type',value:args.html?'text/html; charset=UTF-8':'text/plain; charset=UTF-8'}];if(args.reply_to)custom.push({name:'Reply-To',value:args.reply_to});form.set('custom_headers',JSON.stringify(custom));
   return req('emails',{method:'POST',body:form,idempotencyKey:args._draft_id});
 }
 fail('NOT_IMPLEMENTED','This provider adapter does not implement this operation yet.',501);
}
export async function hostedConnect(config,platform,origin,fetcher=fetch){
 if(!['LINKEDIN','GOOGLE','OUTLOOK','MAIL'].includes(platform))fail('INVALID_INPUT','Unsupported account type.');
 const data=await providerRequest(config,'hosted/accounts/link',{method:'POST',fetcher,body:{type:'create',providers:[platform],api_url:config.base_url,expiresOn:new Date(Date.now()+10*60000).toISOString(),single_use:true,success_redirect_url:origin+'/?tab=connections',failure_redirect_url:origin+'/?tab=connections'}});
 let u;try{u=new URL(data.url);}catch{fail('PROVIDER_PROTOCOL','Provider did not return an authentication URL.',502);}if(u.protocol!=='https:'||!/(^|\.)unipile\.com$/.test(u.hostname))fail('PROVIDER_PROTOCOL','Provider returned an unexpected authentication host.',502);return {url:u.href};
}
