import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {AUTH_ISSUER,PENDING_COOKIE,seal,safeReturn,hash,canonicalOrigin} from '@/lib/vercel-auth.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const origin=canonicalOrigin(process.env.APP_ORIGIN),url=new URL(req.url);
  if(url.origin!==origin)return NextResponse.redirect(new URL(url.pathname+url.search,origin),303);
  const iat=Date.now(),state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('hex');
  const pending=await seal({iat,exp:iat+300000,state,verifier,returnTo:safeReturn(url.searchParams.get('return_to')||'/')},process.env.VORLEN_SESSION_KEY,'pending');
  const target=new URL('/api/vercel/authorize',AUTH_ISSUER);target.searchParams.set('state',state);target.searchParams.set('challenge',await hash(verifier));
  const res=NextResponse.redirect(target,303);res.headers.set('Cache-Control','private, no-store');res.headers.set('Referrer-Policy','no-referrer');
  res.cookies.set(PENDING_COOKIE,pending,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:300});return res;
 }catch{return new Response('Sign-in configuration is unavailable.',{status:503});}
}
