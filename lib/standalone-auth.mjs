import {encrypt,decrypt} from './security.mjs';
export const STANDALONE_COOKIE='__Host-vorlen-standalone';
const ttl=45*60*1000;
export function standaloneConfigured(env=process.env){return Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY&&env.VORLEN_SUPABASE_OWNER_UID&&env.VORLEN_SESSION_KEY&&env.ZERNIO_OWNER_ID);}
function cfg(env=process.env){if(!standaloneConfigured(env))throw new Error('Standalone auth not configured');const u=new URL(env.SUPABASE_URL);if(u.origin!=='https://oulypjxpbrlxbjrxzryf.supabase.co')throw new Error('Incorrect Supabase project');return {base:u.origin,key:env.SUPABASE_PUBLISHABLE_KEY,uid:env.VORLEN_SUPABASE_OWNER_UID};}
async function api(path,options={}){const c=cfg();const r=await fetch(c.base+'/auth/v1/'+path,{...options,redirect:'manual',headers:{apikey:c.key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000),cache:'no-store'});return r;}
export async function authenticatePassword(email,password){if(typeof email!=='string'||typeof password!=='string'||email.length>320||password.length>1024)throw new Error('Invalid credentials');const r=await api('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(!r.ok)throw new Error('Invalid credentials');const p=await r.json();if(!p.access_token||!p.user?.id)throw new Error('Invalid credentials');const user=await verifyAccessToken(p.access_token);if(!user)throw new Error('Not authorized');return {user,token:p.access_token,refreshToken:p.refresh_token,expiresAt:Date.now()+Math.min(2700,p.expires_in||2700)*1000};}
export async function verifyAccessToken(token){if(typeof token!=='string'||token.length>10000)return null;const c=cfg();const r=await api('user',{headers:{Authorization:'Bearer '+token}});if(!r.ok)return null;const user=await r.json();if(user.id!==c.uid||!user.email_confirmed_at)return null;return {userId:process.env.ZERNIO_OWNER_ID||'',displayName:'Workspace owner',email:user.email||'',fullName:null};}
export async function makeStandaloneCookie(token,expiresAt){const exp=Math.min(expiresAt,Date.now()+ttl);return encrypt(JSON.stringify({token,exp}),process.env.VORLEN_SESSION_KEY,'vorlen:standalone:v1');}
export async function readStandaloneCookie(cookie){if(!cookie||cookie.length>14000)return null;try{const value=JSON.parse(await decrypt(cookie,process.env.VORLEN_SESSION_KEY,'vorlen:standalone:v1'));if(value.exp<=Date.now())return null;return verifyAccessToken(value.token);}catch{return null;}}

export const REMEMBER_COOKIE='__Host-vorlen-remember';
export const rememberMaxAge=7*24*60*60;
export async function makeRememberCookie(refreshToken, expiresAt=Date.now()+rememberMaxAge*1000) {
 if(typeof refreshToken!=='string'||!refreshToken||refreshToken.length>10000)throw new Error('Invalid refresh token');
 return encrypt(JSON.stringify({refreshToken,expiresAt}),process.env.VORLEN_SESSION_KEY,'vorlen:remember:v1');
}
export async function refreshRememberCookie(value){
 if(!value||value.length>14000)return null;
 try {
  const previous=JSON.parse(await decrypt(value,process.env.VORLEN_SESSION_KEY,'vorlen:remember:v1'));
  if(previous.expiresAt<=Date.now()||typeof previous.refreshToken!=='string')return null;
  const r=await api('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:previous.refreshToken})});
  if(!r.ok)return null;
  const p=await r.json();
  const user=await verifyAccessToken(p.access_token);
  if(!user||!p.refresh_token)return null;
  return {token:p.access_token,refreshToken:p.refresh_token,expiresAt:Date.now()+Math.min(2700,p.expires_in||2700)*1000,rememberUntil:previous.expiresAt,user};
 }catch{return null;}
}
export async function requestPasswordReset(email,redirectTo) {
 if(typeof email!=='string'||email.length>320)return;
 const u=new URL(redirectTo);
 if(u.origin!==process.env.APP_ORIGIN||u.pathname!=='/reset-password/confirm')throw new Error('Invalid reset origin');
 await api('recover',{method:'POST',body:JSON.stringify({email}),headers:{}});
}
export async function changePasswordWithRecoveryToken(accessToken,password) {
 if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Password must be at least 12 characters');
 const user=await verifyAccessToken(accessToken);
 if(!user)throw new Error('Invalid or expired reset link');
 const r=await api('user',{method:'PUT',headers:{Authorization:'Bearer '+accessToken},body:JSON.stringify({password})});
 if(!r.ok)throw new Error('Unable to update password');
 return true;
}
