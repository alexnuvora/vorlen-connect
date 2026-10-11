import {NextResponse} from 'next/server';
import {STANDALONE_COOKIE} from '@/lib/standalone-auth.mjs';
import {canonicalOrigin} from '@/lib/auth-tokens.mjs';
export const dynamic='force-dynamic';
export async function GET(){
 const res=NextResponse.redirect(new URL('/login',canonicalOrigin(process.env.APP_ORIGIN)),303);
 res.cookies.set(STANDALONE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
 res.headers.set('Cache-Control','no-store');return res;
}
