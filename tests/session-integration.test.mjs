import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionAllowed,publicConnection,SESSION_STATES} from '../lib/session-integration.mjs';
test('all states covered',()=>assert.equal(SESSION_STATES.length,7));
test('connected requires explicit flow, revoked terminal',()=>{
 assert.equal(transitionAllowed('disconnected','connected'),false);
 assert.equal(transitionAllowed('awaiting_login','verification_required'),true);
 assert.equal(transitionAllowed('verification_required','connected'),true);
 assert.equal(transitionAllowed('revoked','connected'),false);
});
test('public projection never leaks session reference',()=>{
 const row={id:'abc',label:'mine',state:'connected',revision:2,session_reference:'SECRET-OPAQUE',last_verified_at:'now',expires_at:'soon',profile_id:'urn:123',verification_kind:'totp'};
 const projected=publicConnection(row);
 assert.equal(projected.session_reference,undefined);
 assert.equal(projected.verification_kind,null);
 assert.equal(projected.profile_id,'urn:123');
});
