// Run only against the explicitly selected Vorlen Connect project.
// Pass URL, service and anon keys in a single stdin JSON line; never command arguments.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {ConnectService} from '../lib/service.mjs';
import {SupabaseStore} from '../lib/supabase-store.mjs';
console.log('Ready for secure Supabase test JSON');
const rl=createInterface({input:process.stdin,terminal:false});
const config=await new Promise(resolve=>rl.once('line',line=>{rl.close();resolve(JSON.parse(line));}));
async function curlFetch(url,options={}){
 const lines=['silent','show-error','max-time = 30','url = '+JSON.stringify(String(url)),'request = '+JSON.stringify(options.method||'GET')];
 for(const [k,v] of Object.entries(options.headers||{}))lines.push('header = '+JSON.stringify(k+': '+v));
 if(options.body!==undefined)lines.push('data = '+JSON.stringify(options.body));
 return new Promise((resolve,reject)=>{const child=spawn('curl',['--config','-','--write-out','\n%{http_code}'],{stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',v=>out+=v);child.stderr.resume();child.on('error',reject);child.on('close',code=>{if(code)return reject(new Error('Network transport failed'));const cut=out.lastIndexOf('\n');const status=Number(out.slice(cut+1));resolve(new Response(status===204?null:out.slice(0,cut),{status,headers:{'Content-Type':'application/json'}}));});child.stdin.end(lines.join('\n'));});
}
const tag='vc_test_'+crypto.randomUUID();const owners=[tag+'_a',tag+'_b'];
const store=owner=>new SupabaseStore(config.url,config.service,owner,curlFetch);
let sends=0;
const upstream=async(url)=>{if(String(url).includes('/accounts'))return Response.json({items:[]});sends++;return Response.json({object:'EmailSent',tracking_id:'test-confirmation',provider_id:null,provider_immutable_id:null},{status:201});};
const alice=new ConnectService(store(owners[0]),owners[0],'ab'.repeat(32),upstream);
const bob=new ConnectService(store(owners[1]),owners[1],'ab'.repeat(32),upstream);
const auth=key=>({apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'});
try {
 for(const table of ['vc_providers','vc_activity','vc_drafts','vc_contacts','vc_suppressions','vc_rate_buckets']){
  const r=await curlFetch(config.url+'/rest/v1/'+table+'?select=*&limit=1',{headers:auth(config.anon)});assert.ok([401,403].includes(r.status),'anon table access must be denied: '+table);
 }
 const rpcAnon=await curlFetch(config.url+'/rest/v1/rpc/vc_store',{method:'POST',headers:auth(config.anon),body:JSON.stringify({p_action:'provider_list',p_owner:owners[0],p:{}})});assert.ok([401,403,404].includes(rpcAnon.status));console.log('PASS: all six tables and the RPC reject anonymous access');
 await alice.saveContact({name:'Verification record',kind:'person',source_url:'https://example.com/'+tag,notes:'Temporary integration test'});
 assert.equal((await bob.dashboard()).contacts.length,0);const contact=(await alice.dashboard()).contacts[0];assert.equal(contact.name,'Verification record');await bob.deleteContact(contact.id);assert.equal((await alice.dashboard()).contacts.length,1);console.log('PASS: live persistence and owner isolation');
 await alice.saveProvider({provider:'unipile',base_url:'https://api1.unipile.com:13111',api_key:'TEST_CREDENTIAL_NO_REAL_PROVIDER'});
 assert.equal((await alice.config('unipile')).key,'TEST_CREDENTIAL_NO_REAL_PROVIDER');await assert.rejects(bob.config('unipile'));console.log('PASS: encrypted provider credentials round-trip');
 const email={account_id:'TEST_ACCOUNT',to:'nobody@example.invalid',subject:'Integration test — never externally sent',text:'Local provider stub only.'};
 const a=await alice.call('send_email.send',email);const b=await alice.call('send_email.send',email);assert.equal(a.data.draft_id,b.data.draft_id);assert.equal(sends,0);
 const approvals=await Promise.allSettled([alice.sendDraft(a.data.draft_id),alice.sendDraft(a.data.draft_id)]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);assert.equal(sends,1);await assert.rejects(alice.sendDraft(a.data.draft_id));console.log('PASS: live Postgres dedupe and concurrent atomic send claim (provider stub)');
 const c=await alice.createDraft('send_email.send',{...email,subject:'Suppression check'});await alice.suppress({recipient:email.to,reason:'Test suppression'});await assert.rejects(alice.sendDraft(c.draft_id),e=>e.code==='RECIPIENT_SUPPRESSED');await alice.cancelDraft(c.draft_id);assert.ok((await alice.usage({})).total_calls>=3);assert.equal((await bob.usage({})).total_calls,0);console.log('PASS: suppression, cancellation and usage isolation');
 await alice.deleteContact(contact.id);await alice.removeProvider('unipile');console.log('PASS: contact and provider removal');
}finally{
 for(const owner of owners){
  for(const table of ['vc_activity','vc_contacts','vc_drafts','vc_providers','vc_suppressions']){
   const r=await curlFetch(config.url+'/rest/v1/'+table+'?'+new URLSearchParams({owner:'eq.'+owner}),{method:'DELETE',headers:auth(config.service)});assert.ok(r.ok,'test cleanup');
  }
  await store(owner).rpc('rate_cleanup',{timestamp:Date.now()+3600000});
 }
 console.log('Temporary verification records removed. No real emails or LinkedIn messages were sent.');
}
