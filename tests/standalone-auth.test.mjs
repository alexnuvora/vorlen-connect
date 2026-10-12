import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatePassword,makeStandaloneCookie,readStandaloneCookie,makeRememberCookie,refreshRememberCookie,requestPasswordReset,changePasswordWithRecoveryToken} from '../lib/standalone-auth.mjs';

const owner='bd593699-023f-42f0-986d-7ab0d0957391';
process.env.SUPABASE_URL='https://oulypjxpbrlxbjrxzryf.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';
process.env.VORLEN_SUPABASE_OWNER_UID=owner;
process.env.VORLEN_SESSION_KEY='ab'.repeat(32);
process.env.ZERNIO_OWNER_ID='original-vorlen-data-owner';
process.env.APP_ORIGIN='https://connect.vorlen.co.uk';
const realFetch=globalThis.fetch;
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}
const matching={id:owner,email:'owner@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'};
test('login requires the configured owner and preserves original business identity',async t=>{
 t.after(()=>{globalThis.fetch=realFetch});
 globalThis.fetch=async(url)=>String(url).includes('grant_type=password')
   ?response({access_token:'access-1',refresh_token:'refresh-1',expires_in:2700,user:matching})
   :response(matching);
 const result=await authenticatePassword('owner@example.com','example-password');
 assert.equal(result.user.userId,'original-vorlen-data-owner');
 assert.equal(result.refreshToken,'refresh-1');
 const encrypted=await makeStandaloneCookie(result.token,result.expiresAt);
 assert.equal((await readStandaloneCookie(encrypted)).userId,'original-vorlen-data-owner');
 globalThis.fetch=async(url)=>String(url).includes('grant_type=password')
   ?response({access_token:'access-2',refresh_token:'refresh-2',expires_in:2700,user:matching})
   :response({...matching,id:'a-different-user'});
 await assert.rejects(authenticatePassword('owner@example.com','example-password'),/Not authorized/);
});
test('remember-session refresh rotates credentials but does not extend the seven-day boundary',async t=>{
 t.after(()=>{globalThis.fetch=realFetch});
 globalThis.fetch=async(url)=>String(url).includes('grant_type=refresh_token')
   ?response({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:2700})
   :response(matching);
 const deadline=Date.now()+3600_000;
 const stored=await makeRememberCookie('original-refresh',deadline);
 const result=await refreshRememberCookie(stored);
 assert.equal(result.refreshToken,'fresh-refresh');
 assert.equal(result.rememberUntil,deadline);
 assert.equal(result.user.userId,'original-vorlen-data-owner');
});
test('recovery requests use exact production URL and reject foreign owners',async t=>{
 t.after(()=>{globalThis.fetch=realFetch});
 const urls=[];
 globalThis.fetch=async(url,options)=>{urls.push({url:String(url),method:options?.method});return response(matching)};
 await requestPasswordReset('owner@example.com','https://connect.vorlen.co.uk/reset-password/confirm');
 assert.ok(urls[0].url.includes('recover?redirect_to=https%3A%2F%2Fconnect.vorlen.co.uk'));
 await assert.rejects(requestPasswordReset('owner@example.com','https://malicious.example/reset-password/confirm'));
 globalThis.fetch=async(url)=>String(url).endsWith('/user')?response({...matching,id:'other-user'}):response(matching);
 await assert.rejects(changePasswordWithRecoveryToken('valid-token','long-passphrase-123'),/Invalid or expired reset link/);
});
