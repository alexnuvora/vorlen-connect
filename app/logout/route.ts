import {NextResponse} from 'next/server';
import {STANDALONE_COOKIE,REMEMBER_COOKIE} from '@/lib/standalone-auth.mjs';
import {canonicalOrigin} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const origin=new URL(req.url).origin;
 const allowed=[canonicalOrigin(process.env.APP_ORIGIN)];
 if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL)allowed.push(canonicalOrigin('https://'+process.env.VERCEL_URL));
 if(!allowed.includes(origin))return new Response('Invalid deployment origin',{status:403});
 const res=NextResponse.redirect(new URL('/login',origin),303);
 res.cookies.set(STANDALONE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
 res.cookies.set(REMEMBER_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
 res.headers.set('Cache-Control','no-store');return res;
}
