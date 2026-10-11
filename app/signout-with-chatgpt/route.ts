import {NextResponse} from 'next/server';
import {SESSION_COOKIE,canonicalOrigin} from '@/lib/auth-tokens.mjs';
import {assertOrigin} from '@/lib/security.mjs';
export async function GET(){return new Response('<!doctype html><title>Sign out</title><form method="post"><button>Sign out of Vorlen Connect</button></form>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
export async function POST(req:Request){
 try{assertOrigin(req);const res=NextResponse.redirect(new URL('/',canonicalOrigin(process.env.APP_ORIGIN)),303);res.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return res;}catch{return new Response('Access denied.',{status:403});}
}
