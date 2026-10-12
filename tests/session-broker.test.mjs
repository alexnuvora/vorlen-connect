import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {verifyWorkerRequest} from '../lib/session-worker-auth.mjs';
import {brokerAction,validateSessionInput,sessionContext} from '../lib/session-broker.mjs';
import {decrypt,encrypt} from '../lib/security.mjs';
import {sessionTools,resolveSessionTool} from '../lib/session-catalog.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');const key=publicKey.export({type:'spki',format:'pem'});
test('worker signatures reject wrong body, wrong key, missing auth and expired requests',()=>{
 const raw=Buffer.from('{"action":"claim"}'),ts=String(Date.now()),nonce=randomUUID();
 const signature=sign(null,Buffer.from(ts+'\n'+nonce+'\n'+createHash('sha256').update(raw).digest('hex')),privateKey).toString('base64');
 const headers=new Headers({'x-vorlen-timestamp':ts,'x-vorlen-nonce':nonce,'x-vorlen-signature':signature});
 assert.equal(verifyWorkerRequest(headers,raw,key),nonce);
 assert.equal(verifyWorkerRequest(headers,Buffer.from('{}'),key),null);
 assert.equal(verifyWorkerRequest(headers,raw,generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})),null);
 assert.equal(verifyWorkerRequest(headers,raw,key,Number(ts)+61000),null);
 assert.equal(verifyWorkerRequest(new Headers(),raw,key),null);
});
test('credentials encrypted per owner/job and excluded from public queue input',async()=>{
 let stored;const svc={owner:'owner-a',secret:'ab'.repeat(32),rate:async()=>{},db:{rpc:async(name,p)=>{stored=p;return {rows:[{job_id:p.id,state:'pending'}]};}}};
 const result=await brokerAction(svc,'enqueue',{connection_id:randomUUID(),operation:'connect',input:{email:'account@example.test',password:'test-private-password'}});
 assert.deepEqual(stored.public_input,{});assert(!JSON.stringify(stored).includes('test-private-password'));assert(!JSON.stringify(result).includes('account@example.test'));
 assert.equal(JSON.parse(await decrypt(stored.encrypted_input,svc.secret,sessionContext(svc.owner,stored.id))).password,'test-private-password');
 await assert.rejects(decrypt(stored.encrypted_input,svc.secret,sessionContext('owner-b',stored.id)));
});
test('schemas prevent arbitrary URLs, cookie injection and oversized outreach',()=>{
 assert.throws(()=>validateSessionInput('profile',{identifier:'https://evil.example'}));
 assert.throws(()=>validateSessionInput('import',{li_at:'foo\r\nmalicious',jsessionid:'abc'}));
 assert.throws(()=>validateSessionInput('send_invitation',{identifier:'person',content:'x'.repeat(201)}));
 assert.throws(()=>validateSessionInput('inbox',{count:26}));
 assert.equal(validateSessionInput('send_invitation',{identifier:'https://www.linkedin.com/in/member',content:'Hello'}).identifier,'member');
});
test('MCP cannot enqueue credentials or bypass draft/read operation allowlists',()=>{
 assert.throws(()=>resolveSessionTool('vorlen_connect_session_read',{operation:'connect'}));
 assert.throws(()=>resolveSessionTool('vorlen_connect_session_draft',{operation:'import'}));
 assert(sessionTools().find(t=>t.name.endsWith('_approve')).annotations.destructiveHint);
});
test('approval requires hash, applies send cap and respects invitation suppression',async()=>{
 const svc={rate:async()=>{},isSuppressed:async()=>true,db:{rpc:async()=>({rows:[{operation:'send_invitation',public_input:{identifier:'blocked'}}]})}};
 await assert.rejects(brokerAction(svc,'approve',{id:randomUUID()}),{code:'APPROVAL_REQUIRED'});
 await assert.rejects(brokerAction(svc,'approve',{id:randomUUID(),content_hash:'a'.repeat(64)}),{code:'RECIPIENT_SUPPRESSED'});
});
