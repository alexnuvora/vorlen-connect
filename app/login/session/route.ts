import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {timingSafeEqual} from 'node:crypto';
import {authenticatePassword,makeStandaloneCookie,STANDALONE_COOKIE,standaloneConfigured} from '@/lib/standalone-auth.mjs';
import {safeReturn} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 // A browser-bound, HttpOnly SameSite=Strict cookie and hidden form token
 // provide CSRF protection independent of Vercel's internal Host/Origin rewriting.
 const fetchSite=req.headers.get('sec-fetch-site');
 if(fetchSite==='cross-site')return new Response('Forbidden',{status:403});
 if(!standaloneConfigured())return new Response('Authentication is not configured.',{status:503});
 if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Forbidden',{status:403});
 if(Number(req.headers.get('content-length')||0)>8000)return new Response('Invalid request',{status:413});
 try{
  const form=await req.formData();
  const csrf=form.get('csrf');
  const stored=(await cookies()).get('__Host-vorlen-login-csrf')?.value;
  if(typeof csrf!=='string'||typeof stored!=='string'||!/^[a-f0-9]{64}$/.test(csrf)||!/^[a-f0-9]{64}$/.test(stored)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(stored)))return new Response('Invalid sign-in form. Refresh the login page.',{status:403});
  const email=form.get('email'),password=form.get('password');
  if(typeof email!=='string'||typeof password!=='string')throw Error('Invalid credentials');
  const {token,expiresAt}=await authenticatePassword(email,password);
  const returnTo=safeReturn(String(form.get('return_to')||'/'));
  const res=new NextResponse(null,{status:303,headers:{Location:returnTo}});
  res.cookies.set(STANDALONE_COOKIE,await makeStandaloneCookie(token,expiresAt),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:2700});
  res.cookies.set('__Host-vorlen-login-csrf','',{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:0});
  res.headers.set('Cache-Control','no-store');return res;
 }catch{
  const res=new NextResponse(null,{status:303,headers:{Location:'/login?error=1'}});
  res.headers.set('Cache-Control','no-store');return res;
 }
}
