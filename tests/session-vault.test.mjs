import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSessionReference,openSessionReference,MAX_SESSION_LIFETIME_MS} from '../lib/session-vault.mjs';
const key='12'.repeat(32),owner='tenant-a',connectionId='39a0e2df-0af0-4a30-b38d-987654f13245',reference='opaque_test_reference_xyz123';
test('seal and open verified scoped opaque references',async()=>{
 const now=Date.now(),expiresAt=new Date(now+3600_000).toISOString();
 const sealed=await sealSessionReference({owner,connectionId,reference,expiresAt,key,now});
 assert.ok(!sealed.includes(reference));
 const opened=await openSessionReference({owner,connectionId,sealed,key,now});
 assert.equal(opened.reference,reference);
 await assert.rejects(()=>openSessionReference({owner:'tenant-b',connectionId,sealed,key,now}),/envelope invalid/);
 await assert.rejects(()=>openSessionReference({owner,connectionId:'39a0e2df-0af0-4a30-b38d-987654f13246',sealed,key,now}),/envelope invalid/);
 await assert.rejects(()=>openSessionReference({owner,connectionId,sealed,key,now:now+7200_000}),/expired/);
});
test('reject missing or excessively long-lived references',async()=>{
 const now=Date.now();
 await assert.rejects(()=>sealSessionReference({owner,connectionId,reference,expiresAt:new Date(now+MAX_SESSION_LIFETIME_MS+10000).toISOString(),key,now}),/expiry exceeds policy/);
 await assert.rejects(()=>sealSessionReference({owner,connectionId,reference:'cookie=value',expiresAt:new Date(now+1000).toISOString(),key,now}),/Invalid opaque/);
});
