import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ConnectService,validateSend} from '../lib/service.mjs';
import {encrypt,decrypt,unipileOrigin,linkedinId,assertOrigin} from '../lib/security.mjs';
import {operations,publicTools} from '../lib/catalog.mjs';
import {runProvider,providerRequest} from '../lib/providers.mjs';
const secret='ab'.repeat(32);
const email={account_id:'acct1',to:'person@example.com',subject:'Hello',text:'An explicitly reviewed message.'};
function db(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../drizzle/0000_slippery_wildside.sql',import.meta.url),'utf8'));
 return {
  sql,
  prepare(q){
   const st=sql.prepare(q);
   return {
    bind(...args){
     return {
      async first(){return st.get(...args)||null;},
      async all(){return {results:st.all(...args)};},
      async run(){const r=st.run(...args);return {meta:{changes:Number(r.changes)}};}
     };
    }
   };
  }
 };
}

const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function fixture(fetcher){const database=db();const requests=[];const fetchMock=async(u,options)=>{requests.push({url:String(u),options});if(String(u).includes('/accounts'))return response({items:[{id:'acct1',type:'GOOGLE_OAUTH',name:'Example'}]});return fetcher?fetcher(u,options):response({object:'EmailSent',tracking_id:'e1',provider_id:'p1',provider_immutable_id:null},201);};const alice=new ConnectService(database,'alice',secret,fetchMock);const bob=new ConnectService(database,'bob',secret,fetchMock);await alice.saveProvider({provider:'unipile',base_url:'https://api1.unipile.com:13111',api_key:'test-secret-key'});requests.length=0;return {database,alice,bob,requests};}
test('inventory retains all 16 tool groups and 40 distinct operations',()=>{assert.equal(operations.length,40);assert.equal(new Set(operations.map(x=>x.id)).size,40);assert.equal(publicTools().length,17);assert.equal(operations.filter(x=>x.implementation==='planned').length,4);});
test('credentials use authenticated encryption bound to user and provider',async()=>{const value=await encrypt('a-secret',secret,'alice:unipile');assert.equal(await decrypt(value,secret,'alice:unipile'),'a-secret');await assert.rejects(decrypt(value,secret,'bob:unipile'));await assert.rejects(decrypt(value+'A',secret,'alice:unipile'));});
test('provider origin rejects SSRF, credentials, redirects and deceptive hostnames',()=>{assert.equal(unipileOrigin('https://api1.unipile.com:13111'),'https://api1.unipile.com:13111');for(const v of ['http://api1.unipile.com','https://127.0.0.1','https://api1.unipile.com.evil.test','https://x@api1.unipile.com','https://api1.unipile.com/path'])assert.throws(()=>unipileOrigin(v));});
test('LinkedIn identities are parsed without ambiguous URL domains',()=>{assert.equal(linkedinId('https://www.linkedin.com/in/person/?x=1'),'person');assert.throws(()=>linkedinId('https://linkedin.com.evil.test/in/person'));assert.throws(()=>linkedinId('https://linkedin.com/company/person'));});
test('cross-site API writes are rejected',()=>{assert.throws(()=>assertOrigin(new Request('https://vorlen.test/api/v1/call',{headers:{Origin:'https://evil.test'}})));});
test('provider keys and workspace data are isolated by owner',async()=>{const {alice,bob,database}=await fixture();await alice.saveContact({name:'Alice contact',kind:'person',source_url:'https://example.com/person',notes:'Private'});assert.equal((await bob.dashboard()).contacts.length,0);await assert.rejects(bob.config('unipile'),e=>e.code==='PROVIDER_NOT_CONNECTED');assert.ok(!database.sql.prepare('SELECT encrypted_key FROM vc_providers').get().encrypted_key.includes('test-secret-key'));const c=(await alice.dashboard()).contacts[0];await bob.deleteContact(c.id);assert.equal((await alice.dashboard()).contacts.length,1);});
test('drafting never sends and identical draft requests deduplicate',async()=>{const {alice,requests}=await fixture();const a=await alice.call('send_email.send',email);const b=await alice.call('send_email.send',{...email});assert.equal(a.data.draft_id,b.data.draft_id);assert.equal(requests.length,0);assert.equal((await alice.dashboard()).drafts.length,1);});
test('a draft belongs only to its owner',async()=>{const {alice,bob}=await fixture();const d=await alice.createDraft('send_email.send',email);await assert.rejects(bob.sendDraft(d.draft_id),e=>e.code==='NOT_FOUND');await assert.rejects(bob.cancelDraft(d.draft_id));});
test('parallel approvals result in only one external send',async()=>{const {alice,requests}=await fixture();const d=await alice.createDraft('send_email.send',email);const settled=await Promise.allSettled([alice.sendDraft(d.draft_id),alice.sendDraft(d.draft_id)]);assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal(requests.length,1);assert.equal(requests[0].options.headers['Idempotency-Key'],d.draft_id);await assert.rejects(alice.sendDraft(d.draft_id),e=>e.code==='DRAFT_ALREADY_HANDLED');});
test('suppression added after drafting is checked again before sending',async()=>{const {alice,requests}=await fixture();const d=await alice.createDraft('send_email.send',email);await alice.suppress({recipient:'PERSON@example.com',reason:'Opted out'});await assert.rejects(alice.sendDraft(d.draft_id),e=>e.code==='RECIPIENT_SUPPRESSED');assert.equal(requests.length,0);});
test('uncertain provider result is never automatically replayed',async()=>{const {alice,requests}=await fixture(()=>{throw new Error('network timeout');});const d=await alice.createDraft('send_email.send',email);await assert.rejects(alice.sendDraft(d.draft_id));assert.equal((await alice.dashboard()).drafts[0].status,'unknown');await assert.rejects(alice.sendDraft(d.draft_id),e=>e.code==='DRAFT_ALREADY_HANDLED');assert.equal(requests.length,1);});
test('HTTP success without provider acknowledgement is not labelled sent',async()=>{const {alice}=await fixture(()=>response({}));const d=await alice.createDraft('send_email.send',email);const r=await alice.sendDraft(d.draft_id);assert.equal(r.status,'unknown');});
test('account responses never expose provider connection secrets',async()=>{const r=await runProvider('accounts.list',{}, {provider:'unipile',base_url:'https://api1.unipile.com',key:'secret'},async()=>response({items:[{id:'a',type:'LINKEDIN',connection_params:{password:'hidden',token:'hidden'},sources:[{id:'s',status:'OK',password:'hidden'}]}]}));assert.ok(!JSON.stringify(r).includes('hidden'));});
test('unsupported filters fail rather than broadening the search',async()=>{let called=false;await assert.rejects(runProvider('profiles.search_companies',{account_id:'a',params:{title:['CEO']}},{provider:'unipile',base_url:'https://api1.unipile.com',key:'secret'},async()=>{called=true;return response({});}),e=>e.code==='UNSUPPORTED_PARAMETER');assert.equal(called,false);});
test('enrichment 202 is pending and rate-limit errors preserve retry timing',async()=>{const c={provider:'hunter',key:'secret'};assert.equal((await providerRequest(c,'email-verifier',{fetcher:async()=>response({data:null},202)})).status,'pending');await assert.rejects(providerRequest(c,'account',{fetcher:async()=>new Response('{}',{status:429,headers:{'Retry-After':'60'}})}),e=>e.code==='PROVIDER_RATE_LIMIT'&&e.details.retry_after==='60');});
test('send validation rejects oversized invitations, malformed addresses and remote attachments',()=>{assert.throws(()=>validateSend('send_connection.send',{account_id:'a',identifier:'p',message:'x'.repeat(301)}));assert.throws(()=>validateSend('send_email.send',{...email,to:'bad'}));assert.throws(()=>validateSend('send_message.send',{account_id:'a',profile_url:'https://linkedin.com/in/p',message_text:'hi',media_link:'https://example.com/payload'}));});
test('native usage spans the full history and owner scopes every count',async()=>{const {alice,bob}=await fixture();await alice.call('usage.get');await alice.call('usage.get');assert.equal((await alice.usage({})).total_calls,2);assert.equal((await bob.usage({})).total_calls,0);});
