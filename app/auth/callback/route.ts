import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {PENDING_COOKIE,SESSION_COOKIE,unseal,seal,verifyAssertion,safeReturn,canonicalOrigin} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const origin=canonicalOrigin(process.env.APP_ORIGIN),url=new URL(req.url);
  if(url.origin!==origin)throw new Error('Origin mismatch');
  const jar=await cookies(),pending=await unseal(jar.get(PENDING_COOKIE)?.value,process.env.VORLEN_SESSION_KEY,'pending');
  if(pending.exp-pending.iat>300000)throw new Error('Invalid login');
  const user=await verifyAssertion(url.searchParams.get('assertion'),pending,process.env.VORLEN_AUTH_BRIDGE_KEY,origin,process.env.ZERNIO_OWNER_ID);
  const iat=Date.now(),session=await seal({iat,exp:iat+28800000,aud:origin,user},process.env.VORLEN_SESSION_KEY,'session');
  const res=NextResponse.redirect(new URL(safeReturn(pending.returnTo),origin),303);
  res.cookies.set(SESSION_COOKIE,session,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:28800});
  res.cookies.set(PENDING_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  res.headers.set('Cache-Control','private, no-store');res.headers.set('Referrer-Policy','no-referrer');return res;
 }catch{return new Response('This sign-in request expired or is invalid. Return to the app and sign in again.',{status:401,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
}
