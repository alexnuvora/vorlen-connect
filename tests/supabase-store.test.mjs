import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../lib/supabase-store.mjs';

test('default transport retains the global fetch receiver required by Workers', async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async function(url,options){
  assert.equal(this,globalThis,'fetch must not receive the store as its receiver');
  assert.equal(options.redirect,'manual');
  assert.equal(url,'https://oulypjxpbrlxbjrxzryf.supabase.co/rest/v1/rpc/vc_store');
  assert.deepEqual(JSON.parse(options.body),{p_action:'provider_list',p_owner:'owner-a',p:{}});
  return Response.json({rows:[],changes:0});
 };
 try {
  const store=new SupabaseStore('https://oulypjxpbrlxbjrxzryf.supabase.co','test-key','owner-a');
  assert.deepEqual(await store.prepare('SELECT provider,base_url,updated_at FROM vc_providers WHERE owner=?').bind('owner-a').all(),{results:[]});
  await assert.rejects(store.prepare('SELECT provider,base_url,updated_at FROM vc_providers WHERE owner=?').bind('owner-b').all(),e=>e.code==='OWNER_MISMATCH');
 } finally {globalThis.fetch=original;}
});


test('Supabase redirects are rejected without following or forwarding credentials',async()=>{
 const store=new SupabaseStore('https://oulypjxpbrlxbjrxzryf.supabase.co','test-key','owner-a',async(url,options)=>{
  assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});
 });
 await assert.rejects(store.rpc('provider_list',{}),e=>e.code==='DATABASE_ERROR');
});
