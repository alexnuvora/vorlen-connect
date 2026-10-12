import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {encrypt,decrypt} from '../lib/security.mjs';
import {sessionContext} from '../lib/session-broker.mjs';
const require=createRequire(import.meta.url);
let source=await readFile(new URL('../app/api/session-worker/route.ts',import.meta.url),'utf8');
source=source.replaceAll("'@/lib/", "'"+new URL('../lib/',import.meta.url).href).replace("from 'zod'","from '"+pathToFileURL(require.resolve('zod')).href+"'");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('signed worker route delivers scoped plaintext only to the worker and encrypts completions',async t=>{
 const keys=generateKeyPairSync('ed25519'),secret='cd'.repeat(32),owner='route-test-owner',id=randomUUID(),connection_id=randomUUID();
 const saved={...process.env},fetcher=globalThis.fetch;
 t.after(()=>{process.env=saved;globalThis.fetch=fetcher;});
 Object.assign(process.env,{VORLEN_SESSION_WORKER_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}),ZERNIO_OWNER_ID:owner,CREDENTIAL_ENCRYPTION_KEY:secret,SUPABASE_URL:'https://oulypjxpbrlxbjrxzryf.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-server-key'});
 function request(payload){const body=JSON.stringify(payload),timestamp=String(Date.now()),nonce=randomUUID();const sig=sign(null,Buffer.from(timestamp+'\n'+nonce+'\n'+createHash('sha256').update(body).digest('hex')),keys.privateKey).toString('base64');return new Request('https://connect.vorlen.co.uk/api/session-worker',{method:'POST',body,headers:{'x-vorlen-timestamp':timestamp,'x-vorlen-nonce':nonce,'x-vorlen-signature':sig}});}
 let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.p_owner,owner);assert.equal(url,'https://oulypjxpbrlxbjrxzryf.supabase.co/rest/v1/rpc/vc_session_worker');return Response.json({rows:[{id,owner_id:owner,connection_id,operation:'connect',lease_token:randomUUID(),encrypted_input:await encrypt(JSON.stringify({email:'owner@example.test',password:'test-password'}),secret,sessionContext(owner,id))}],changes:1,connections:[connection_id]});};
 const unauthorized=await POST(new Request('https://connect.vorlen.co.uk/api/session-worker',{method:'POST',body:'{}'}));assert.equal(unauthorized.status,401);assert.equal(calls,0);
 const response=await POST(request({action:'claim',version:'test'}));assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.data.rows[0].input.password,'test-password');assert.equal(result.data.rows[0].encrypted_input,undefined);assert.equal(result.data.owner_id,owner);
 globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);assert.equal(body.p_owner,owner);assert.equal(body.p.data,undefined);assert(!init.body.includes('private inbox fixture'));const output=JSON.parse(await decrypt(body.p.encrypted_result,secret,sessionContext(owner,id)+':result'));assert.equal(output.data.message,'private inbox fixture');return Response.json({rows:[],changes:1,connections:[connection_id]});};
 const finish=await POST(request({action:'finish',version:'test',id,lease_token:randomUUID(),result:{ok:true,data:{message:'private inbox fixture'}}}));assert.equal(finish.status,200);assert.equal(finish.headers.get('cache-control'),'no-store');
});
