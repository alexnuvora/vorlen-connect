import {NextResponse} from 'next/server';
import {authenticatePassword,makeStandaloneCookie,STANDALONE_COOKIE,standaloneConfigured} from '@/lib/standalone-auth.mjs';
import {canonicalOrigin,safeReturn} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const originHeader=req.headers.get('origin');
 const fetchSite=req.headers.get('sec-fetch-site');
 const canonical=canonicalOrigin(process.env.APP_ORIGIN);
 // Vercel rewrites the internal request URL/Host; browser Origin is the canonical
 // navigation origin. Only allow the fixed app origin or this project's previews.
 const isPreview=process.env.VERCEL_ENV==='preview'&&typeof originHeader==='string'&&
   /^https:\/\/vorlen-connect-[a-z0-9-]+-talent-flow3\.vercel\.app$/.test(originHeader);
 const origin=isPreview?originHeader:canonical;
 if(originHeader!==origin || (fetchSite && fetchSite!=='same-origin' && fetchSite!=='none'))
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
