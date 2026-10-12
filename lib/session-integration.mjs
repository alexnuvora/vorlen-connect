// Worker and API share explicit connection lifecycle. No LinkedIn credentials
// or authentication challenges are processed inside the Vercel application.
export const SESSION_STATES=Object.freeze(['disconnected','awaiting_login','verification_required','connected','expired','revoked','error']);
export const VERIFICATION_KINDS=Object.freeze(['email','totp','push','captcha','other']);
export const ALLOWED_TRANSITIONS=Object.freeze({
 disconnected:['awaiting_login','revoked'],
 awaiting_login:['verification_required','connected','error','revoked'],
 verification_required:['awaiting_login','connected','error','revoked'],
 connected:['expired','revoked','error'],
 expired:['awaiting_login','revoked'],
 error:['awaiting_login','revoked'],
 revoked:[]
});
export function transitionAllowed(from,to){
 return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
}
export function publicConnection(row){
 return {
  id:row.id,label:row.label,state:row.state,
  verification_required:row.state==='verification_required',
  verification_kind:row.state==='verification_required'?row.verification_kind:null,
  profile_id:row.state==='connected'?row.profile_id:null,
  last_verified_at:row.last_verified_at,expires_at:row.expires_at,
  revision:row.revision,last_error_code:row.last_error_code
 };
}
