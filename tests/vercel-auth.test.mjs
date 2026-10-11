import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {AUTH_ISSUER,seal,unseal,verifyAssertion,sessionUser,validBearer,safeReturn} from '../lib/auth-tokens.mjs';
import {hash} from '../lib/security.mjs';
const key=randomBytes(32).toString('hex'),origin='https://example.vercel.app',owner='test-owner';
const user={userId:owner,email:'owner@example.com',displayName:'Owner',fullName:null};
test('login assertions require correct audience, owner and browser challenge',async()=>{
 const iat=Date.now(),pending={state:'state',verifier:'browser-verifier'};
 const claim={iss:AUTH_ISSUER,aud:origin,iat,exp:iat+60000,state:pending.state,challenge:await hash(pending.verifier),user};
 const token=await seal(claim,key,'assertion');
 assert.deepEqual(await verifyAssertion(token,pending,key,origin,owner),user);
 for(const args of [[{...pending,state:'other'},key,origin,owner],[{...pending,verifier:'attacker'},key,origin,owner],[pending,key,'https://evil.example',owner],[pending,key,origin,'other-owner'],[pending,randomBytes(32).toString('hex'),origin,owner]])await assert.rejects(verifyAssertion(token,...args));
 await assert.rejects(verifyAssertion(token,pending,key,origin,owner,iat+60001));
 await assert.rejects(verifyAssertion(await seal({...claim,exp:iat+600000},key,'assertion'),pending,key,origin,owner));
});
test('sessions are encrypted, scoped, expiring and separated from assertions',async()=>{
 const iat=Date.now(),token=await seal({iat,exp:iat+28800000,aud:origin,user},key,'session');
 assert.equal(token.includes(user.email),false);assert.deepEqual(await sessionUser(token,key,origin,owner),user);
 assert.equal(await sessionUser(token,key,origin,'other'),null);assert.equal(await sessionUser(token,key,'https://evil.example',owner),null);
 assert.equal(await sessionUser('forged',key,origin,owner),null);await assert.rejects(unseal(token,key,'assertion'));
 await assert.rejects(unseal(token,key,'session',iat+28800001));
});
test('API bearer access requires a configured full secret',async()=>{
 assert.equal(await validBearer('Bearer '+key,key),true);
 assert.equal(await validBearer('Bearer '+randomBytes(32).toString('hex'),key),false);
 assert.equal(await validBearer('Bearer undefined',undefined),false);
 assert.equal(await validBearer('Bearer '+key+'suffix',key),false);
});
test('return paths cannot redirect externally or loop through authentication',()=>{
 for(const value of ['//evil.example','https://evil.example','/\\evil.example','/signin-with-chatgpt','/auth/callback'])assert.equal(safeReturn(value),'/');
 assert.equal(safeReturn('/?tab=connections'),'/?tab=connections');
});
