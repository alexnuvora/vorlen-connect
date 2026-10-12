import {encrypt,decrypt,fail} from './security.mjs';

// Encrypted application-side envelope for opaque, non-password connection
// metadata. This is NOT a LinkedIn cookie/password storage or login client.
// A live provider credential broker requires separate approval and implementation.
export const MAX_SESSION_LIFETIME_MS=24*60*60*1000;
function validRef(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{16,128}$/.test(value);}
function context(owner,connectionId){
 if(!owner||owner.length>300||!(/^[0-9a-f-]{36}$/i.test(connectionId||'')))fail('INVALID_SESSION','Invalid connection scope.',400);
 return 'vorlen:session:v1:'+owner+':'+connectionId;
}
export async function sealSessionReference({owner,connectionId,reference,expiresAt,key,now=Date.now()}){
 if(!validRef(reference))fail('INVALID_SESSION','Invalid opaque reference.',400);
 const expires=Date.parse(expiresAt);
 if(!Number.isFinite(expires)||expires<=now||expires-now>MAX_SESSION_LIFETIME_MS)fail('INVALID_SESSION','Session expiry exceeds policy.',400);
 return encrypt(JSON.stringify({v:1,reference,expiresAt:new Date(expires).toISOString()}),key,context(owner,connectionId));
}
export async function openSessionReference({owner,connectionId,sealed,key,now=Date.now()}){
 if(typeof sealed!=='string'||sealed.length>4096)fail('INVALID_SESSION','Invalid envelope.',400);
 let data;
 try{data=JSON.parse(await decrypt(sealed,key,context(owner,connectionId)));}catch{fail('INVALID_SESSION','Session envelope invalid.',401);}
 if(data?.v!==1||!validRef(data.reference)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now)fail('SESSION_EXPIRED','Session reference has expired.',401);
 return {reference:data.reference,expiresAt:data.expiresAt};
}
