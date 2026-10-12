import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){
 const res=NextResponse.redirect(new URL('/login',process.env.APP_ORIGIN||'https://connect.vorlen.co.uk'),303);
 // Relative redirect retains active preview host even behind Vercel proxy.
 res.headers.set('Location','/login');
 res.headers.set('Cache-Control','no-store');
 res.cookies.set('__Host-vorlen-login-csrf',randomBytes(32).toString('hex'),{secure:true,httpOnly:true,sameSite:'strict',path:'/',maxAge:600});
 return res;
}
