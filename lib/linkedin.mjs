import {z} from 'zod';
import {fail} from './security.mjs';
export const LINKEDIN_ORIGIN='https://vorlen-connect.fresh-charm-4046.chatgpt.site';
export const LINKEDIN_CALLBACK=LINKEDIN_ORIGIN+'/api/linkedin/callback';
export const LINKEDIN_SCOPES='openid profile w_member_social';
export const LINKEDIN_VERSION='202609';
const schema=z.object({account_id:z.string().uuid(),content:z.string().trim().min(1).max(3000)}).strict();
export function validateLinkedInPost(input){return schema.parse(input);}
export class LinkedInClient {
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;}
 async request(url,options={}){
  let response;try{response=await this.fetcher.call(globalThis,url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{fail('LINKEDIN_UNREACHABLE','LinkedIn did not confirm this request. Do not retry an uncertain publication.',503);}
  if(!response.ok)fail(response.status===401?'LINKEDIN_RECONNECT':response.status===429?'LINKEDIN_RATE_LIMIT':'LINKEDIN_ERROR',`LinkedIn returned HTTP ${response.status}. Check your app access or reconnect.`,response.status===429?429:502);
  return response;
 }
 authorization(clientId,state){const url=new URL('https://www.linkedin.com/oauth/v2/authorization');url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:LINKEDIN_CALLBACK,state,scope:LINKEDIN_SCOPES}).toString();return url.href;}
 async exchange(config,code){const r=await this.request('https://www.linkedin.com/oauth/v2/accessToken',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:config.client_id,client_secret:config.client_secret,redirect_uri:LINKEDIN_CALLBACK}).toString()});const p=await r.json();if(typeof p.access_token!=='string'||!Number.isFinite(p.expires_in)||p.expires_in<=0)fail('LINKEDIN_PROTOCOL','LinkedIn returned an invalid token response.',502);return {access_token:p.access_token,expires_at:new Date(Date.now()+p.expires_in*1000).toISOString(),scopes:typeof p.scope==='string'?p.scope.split(/[ ,]+/):LINKEDIN_SCOPES.split(' ')};}
 async profile(token){const r=await this.request('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:'Bearer '+token}});const p=await r.json();if(typeof p.sub!=='string'||!/^[-_a-zA-Z0-9]{1,200}$/.test(p.sub))fail('LINKEDIN_PROTOCOL','LinkedIn did not return a valid member identity.',502);return {subject:p.sub,name:typeof p.name==='string'?p.name.slice(0,300):'LinkedIn member'};}
 async publish(token,subject,content){const r=await this.request('https://api.linkedin.com/rest/posts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','LinkedIn-Version':LINKEDIN_VERSION,'X-Restli-Protocol-Version':'2.0.0'},body:JSON.stringify({author:'urn:li:person:'+subject,commentary:content,visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false})});const id=r.headers.get('x-restli-id');return {acknowledged:r.status===201&&!!id,post_id:id||null,http_status:r.status};}
}
