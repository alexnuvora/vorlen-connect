import {encrypt,decrypt,hash} from './security.mjs';
export const AUTH_ISSUER='https://vorlen-connect.fresh-charm-4046.chatgpt.site';
export const SESSION_COOKIE='__Host-vorlen-session';
export const PENDING_COOKIE='__Host-vorlen-login';
export const cookieOptions={httpOnly:true,secure:true,sameSite:'lax',path:'/'};
export function safeReturn(value='/') {
 try {const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&!/^\/(?:auth|signin-with-chatgpt|signout-with-chatgpt)(?:\/|$)/.test(u.pathname)?u.pathname+u.search:'/';}catch{return '/';}
}
export function canonicalOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.origin!==value)throw new Error('Invalid app origin');return u.origin;}
export async function seal(value,key,purpose){return encrypt(JSON.stringify(value),key,'vorlen:'+purpose+':v1');}
export async function unseal(token,key,purpose,clock=Date.now()){
 if(typeof token!=='string'||token.length>12000)throw new Error('Invalid token');
 const value=JSON.parse(await decrypt(token,key,'vorlen:'+purpose+':v1'));
 if(!Number.isFinite(value.exp)||value.exp<=clock||!Number.isFinite(value.iat)||value.iat>clock+10000||value.exp<=value.iat)throw new Error('Expired token');return value;
}
export async function verifyAssertion(token,pending,key,origin,owner,clock=Date.now()){
 const claim=await unseal(token,key,'assertion',clock);
 if(claim.exp-claim.iat>60000||claim.iss!==AUTH_ISSUER||claim.aud!==origin||claim.state!==pending.state||claim.challenge!==await hash(pending.verifier)||claim.user?.userId!==owner||typeof claim.user?.email!=='string'||!claim.user.email)throw new Error('Invalid assertion');return claim.user;
}
export async function sessionUser(token,key,origin,owner){
 try{const s=await unseal(token,key,'session');return s.exp-s.iat<=28800000&&s.aud===origin&&s.user?.userId===owner?s.user:null;}catch{return null;}
}
export async function validBearer(header,key){
 if(!/^[a-f0-9]{64}$/.test(key||'')||typeof header!=='string'||!/^Bearer [a-f0-9]{64}$/.test(header))return false;
 const a=await hash(header.slice(7)),b=await hash(key);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
