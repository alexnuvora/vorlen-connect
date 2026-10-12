import {NextResponse} from 'next/server';
import {authenticatePassword,makeStandaloneCookie,STANDALONE_COOKIE,standaloneConfigured} from '@/lib/standalone-auth.mjs';
import {canonicalOrigin,safeReturn} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const originHeader=req.headers.get('origin');
 const fetchSite=req.headers.get('sec-fetch-site');
 const host=req.headers.get('x-forwarded-host')||req.headers.get('host');
 const canonical=canonicalOrigin(process.env.APP_ORIGIN);
 // Only trust a fixed project hostname. Browser Origin can be absent on some
 // form submissions; in that case Fetch Metadata must prove same-origin.
 const preview=process.env.VERCEL_ENV==='preview' && typeof host==='string' &&
   /^vorlen-connect-[a-z0-9-]+-talent-flow3\.vercel\.app$/.test(host);
 const origin=preview?'https://'+host:canonical;
 if(typeof host!=='string'||new URL(origin).host!==host||
    (originHeader!==null&&originHeader!==origin)||
    (fetchSite!==null&&fetchSite!=='same-origin')||
    (originHeader===null&&fetchSite!=='same-origin'))
   return new Response('Forbidden',{status:403});
 if(!standaloneConfigured())return new Response('Authentication is not configured.',{status:503});
 if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Forbidden',{status:403});
 if(Number(req.headers.get('content-length')||0)>8000)return new Response('Invalid request',{status:413});
 try{
  const form=await req.formData();
  const email=form.get('email'),password=form.get('password');
  if(typeof email!=='string'||typeof password!=='string')throw Error('Invalid credentials');
  const {token,expiresAt}=await authenticatePassword(email,password);
  const returnTo=safeReturn(String(form.get('return_to')||'/'));
  const res=NextResponse.redirect(new URL(returnTo,origin),303);
  res.cookies.set(STANDALONE_COOKIE,await makeStandaloneCookie(token,expiresAt),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:2700});
  res.headers.set('Cache-Control','no-store');return res;
 }catch{
  const res=NextResponse.redirect(new URL('/login?error=1',origin),303);
  res.headers.set('Cache-Control','no-store');return res;
 }
}
