import test from 'node:test';
import assert from 'node:assert/strict';
import {validRedirect,validClientId,validPkce,challenge,digest,safeRedirect,RESOURCE,ISSUER} from '../lib/mcp-oauth.mjs';
test('OAuth issuer and MCP resource are pinned to the canonical HTTPS production origin',()=>{
 assert.equal(ISSUER,'https://connect.vorlen.co.uk');
 assert.equal(RESOURCE,'https://connect.vorlen.co.uk/mcp');
});
test('OAuth redirect validation rejects insecure remote domains and credential-bearing URLs',()=>{
 assert.equal(validRedirect('https://chatgpt.com/connector_platform_oauth_redirect'),true);
 assert.equal(validRedirect('http://localhost:5858/oauth/callback'),true);
 for(const u of ['http://attacker.example/cb','https://user:pass@example.com/cb','https://example.com/cb#secret','javascript:alert(1)','https://','ftp://example.com/cb'])assert.equal(validRedirect(u),false,u);
});
test('PKCE S256 derives a 43-character base64url challenge and grants require exact client ID',()=>{
 const v='A'.repeat(64);
 assert.equal(validPkce(challenge(v)),true);
 assert.equal(challenge(v),digest(v)?challenge(v):'');
 assert.equal(validClientId('vc_'+ 'A'.repeat(43)),true);
 assert.equal(validClientId('demo'),false);
});
test('OAuth redirect only adds authorization code and state at verified redirect target',()=>{
 const url=safeRedirect('https://chatgpt.com/oauth/callback','sample-code','state-123');
 const u=new URL(url);
 assert.equal(u.hostname,'chatgpt.com');
 assert.equal(u.searchParams.get('code'),'sample-code');
 assert.equal(u.searchParams.get('state'),'state-123');
});
