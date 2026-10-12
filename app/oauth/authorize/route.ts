import {NextRequest,NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {seal,unseal} from '@/lib/auth-tokens.mjs';
import {registered,RESOURCE,validPkce,randomToken,digest,store,safeRedirect} from '@/lib/mcp-oauth.mjs';
export const dynamic='force-dynamic';
const pendingCookie='__Host-vorlen-oauth-pending';
const formPage=(name:string,csrf:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorise Vorlen Connect</title><style>body{background:#f4f8f6;color:#183b39;font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:440px;padding:38px;background:white;border:1px solid #d9e5e0;border-radius:18px;box-shadow:0 14px 55px #10251c13}h1{font-size:27px}p{line-height:1.6}button{padding:15px 26px;background:#115451;color:white;border:0;border-radius:9px;font-weight:bold;cursor:pointer}.muted{color:#61736d;font-size:14px}</style></head><body><section class="card"><h1>Connect ChatGPT to Vorlen</h1><p><b>${name.replace(/[&<>"']/g,'')}</b> is requesting access to your Vorlen Connect workspace.</p><p class="muted">This connection can view drafts and request publishing actions. Only approve if you initiated this connection in ChatGPT.</p><form method="POST"><input type="hidden" name="csrf" value="${csrf}"><button type="submit" name="decision" value="approve">Authorise ChatGPT</button> <button type="submit" name="decision" value="deny" style="background:#6c7674">Cancel</button></form></section></body></html>`;
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams;
 const client_id=q.get('client_id')||'',redirect_uri=q.get('redirect_uri')||'',challenge=q.get('code_challenge')||'',state=q.get('state')||'',resource=q.get('resource')||'';
 const client=await registered(client_id,redirect_uri);
 if(!client||q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!validPkce(challenge)||resource!==RESOURCE||state.length>1024)return new Response('Invalid OAuth authorisation request',{status:400});
 const user=await getChatGPTUser();
 if(!user){const back='/oauth/authorize'+req.nextUrl.search;return NextResponse.redirect(new URL('/login?return_to='+encodeURIComponent(back),req.url),303);}
 const csrf=randomToken();
 const value=await seal({iat:Date.now(),exp:Date.now()+600000,client_id,redirect_uri,challenge,state,resource,csrf},process.env.VORLEN_SESSION_KEY,'oauth-pending');
 const res=new NextResponse(formPage(client.client_name,csrf),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 res.cookies.set(pendingCookie,value,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
 return res;
}
export async function POST(req:NextRequest){
 const user=await getChatGPTUser();if(!user)return new Response('Session expired, sign in again.',{status:401});
 if(req.headers.get('sec-fetch-site')==='cross-site')return new Response('Forbidden',{status:403});
 try{
  const pending=await unseal(req.cookies.get(pendingCookie)?.value,process.env.VORLEN_SESSION_KEY,'oauth-pending');
  const form=await req.formData();
  if(form.get('csrf')!==pending.csrf)return new Response('Invalid authorisation',{status:403});
  const valid=await registered(pending.client_id,pending.redirect_uri);
  if(!valid)return new Response('OAuth client no longer valid',{status:400});
  const clear=(url:string)=>{const response=NextResponse.redirect(url,303);response.cookies.set(pendingCookie,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return response;};
  if(form.get('decision')!=='approve'){const u=new URL(pending.redirect_uri);u.searchParams.set('error','access_denied');if(pending.state)u.searchParams.set('state',pending.state);return clear(u.href);}
  const code=randomToken();const r=await store('issue_code',{client_id:pending.client_id,redirect_uri:pending.redirect_uri,pkce_challenge:pending.challenge,resource:RESOURCE,secret_hash:digest(code)});
  if(r.changes!==1)return new Response('Could not issue authorisation',{status:503});
  return clear(safeRedirect(pending.redirect_uri,code,pending.state));
 }catch{return new Response('Authorisation expired or invalid',{status:400});}
}
