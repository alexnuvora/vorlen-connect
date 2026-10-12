import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {nativeInput,nativeCall} from '../lib/native-routing.mjs';
import {nativeCoverage} from '../lib/native-contract.mjs';
import {validateSessionInput,brokerAction,sessionContext} from '../lib/session-broker.mjs';
import {decrypt} from '../lib/security.mjs';
import {VorlenService} from '../lib/linkedin-service.mjs';
test('native routing resolves profile URLs and rejects hidden overrides/unsupported filters',()=>{
 assert.deepEqual(nativeInput('conversation.get',{account_id:'x',profile_url:'https://www.linkedin.com/in/member',count:5}),{identifier:'member',count:5});
 assert.throws(()=>nativeInput('profiles.get',{account_id:'x',params:{account_id:'different'}}));
 assert.throws(()=>nativeInput('profiles.search_people',{count:3,params:{count:5}}));
 assert.throws(()=>validateSessionInput('search_people',nativeInput('profiles.search_people',{params:{location:'Manchester'}})));
 assert.equal(validateSessionInput('search_people',{location:'100',keywords:'engineer'}).location,'100');
 assert.throws(()=>nativeInput('send_message.send',{profile_url:'https://www.linkedin.com/in/member',media_link:'https://example.com/file'}),{code:'NATIVE_ATTACHMENT_NOT_READY'});
 assert.throws(()=>validateSessionInput('conversation',{identifier:'x',conversation_id:'y'}));
 assert.throws(()=>nativeInput('content.get_comments',{params:{post_url:'https://evil.example/activity-123'}}));
});
test('mail credentials are encrypted and cannot enter public queue fields',async()=>{
 let saved;const svc={owner:'o',secret:'ab'.repeat(32),rate:async()=>{},db:{rpc:async(_,p)=>{saved=p;return {rows:[{job_id:p.id,state:'pending'}]};}}};
 await brokerAction(svc,'enqueue',{connection_id:randomUUID(),operation:'connect_mail',input:{email:'test@example.com',password:'private-test',imap_host:'imap.example.com',smtp_host:'smtp.example.com'}});
 assert.deepEqual(saved.public_input,{});assert(!JSON.stringify(saved).includes('private-test'));
 assert.equal(JSON.parse(await decrypt(saved.encrypted_input,svc.secret,sessionContext('o',saved.id))).password,'private-test');
 assert.throws(()=>validateSessionInput('connect_mail',{email:'a@example.com',password:'x',imap_host:'imap.example.com',smtp_host:'smtp.example.com',smtp_port:25}));
 assert.throws(()=>validateSessionInput('send_email',{to:'a@example.com',subject:'x\r\nBcc:other@example.com',text:'hello'}));
});
test('native sends enqueue drafts, never invoke legacy provider or direct send',async()=>{
 let queued;const svc={owner:'o',secret:'ab'.repeat(32),rate:async()=>{},db:{rpc:async(_,p)=>{queued=p;return {rows:[{state:'draft',job_id:p.id}]};}}};
 const result=await nativeCall(svc,'send_message.send',{account_id:randomUUID(),profile_url:'https://www.linkedin.com/in/member',message_text:'Exact text'});
 assert.equal(result.state,'draft');assert.equal(queued.operation,'send_message');assert.equal(queued.public_input.content,'Exact text');
 await assert.rejects(nativeCall(svc,'recruiter.get_cv',{account_id:randomUUID(),params:{application_id:'x'}}),{code:'NATIVE_CAPABILITY_PENDING'});
});
test('email suppression blocks approval, not just initial drafting',async()=>{
 const svc={rate:async()=>{},isSuppressed:async r=>r==='blocked@example.com',db:{rpc:async()=>({rows:[{operation:'send_email',public_input:{to:'blocked@example.com'}}]})}};
 await assert.rejects(brokerAction(svc,'approve',{id:randomUUID(),content_hash:'a'.repeat(64)}),{code:'RECIPIENT_SUPPRESSED'});
});
test('Vorlen dispatch uses native path even when optional provider exists',async()=>{
 const svc=new VorlenService({rpc:async()=>({rows:[]})},'owner','ab'.repeat(32),{ZERNIO_OWNER_ID:'owner',ZERNIO_API_KEY:'test-key'},()=>{throw Error('must not call provider');});
 svc.rate=async()=>{};svc.log=async()=>{};
 const result=await svc.call('accounts.list',{});assert.deepEqual(result.data.accounts,[]);
 await assert.rejects(svc.call('content.search',{account_id:randomUUID()}),{code:'NATIVE_CAPABILITY_PENDING'});
});
test('coverage does not confuse adapters, blocked features and live verification',()=>{
 const rows=nativeCoverage();assert.equal(rows.length,40);assert.equal(new Set(rows.map(r=>r.id)).size,40);
 assert(rows.every(r=>r.live_verified===false));assert.equal(rows.find(r=>r.id==='recruiter.get_cv').implementation,'blocked');
});
test('native research requires an unambiguous account and exposes supported limits',async()=>{
 await assert.rejects(nativeCall({rate:async()=>{},db:{rpc:async()=>({rows:[]})}},'enrich.extract_employees',{params:{company_url:'https://www.linkedin.com/company/example'}}),{code:'ACCOUNT_REQUIRED'});
 assert.deepEqual(nativeInput('enrich.extract_employees',{params:{company_url:'https://www.linkedin.com/company/example',limit:5}}),{identifier:'example',count:5});
 assert.equal(validateSessionInput('search_jobs',{keywords:'engineer',is_remote:true,job_type:'fulltime'}).job_type,'fulltime');
 assert.throws(()=>validateSessionInput('search_jobs',{keywords:'engineer',board:'indeed'}));
});
