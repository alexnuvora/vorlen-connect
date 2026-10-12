import {NextRequest,NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';

const name='__Host-vorlen-login-csrf';
export function proxy(request:NextRequest){
 const current=request.cookies.get(name)?.value;
 if(current&&/^[a-f0-9]{64}$/.test(current))return NextResponse.next();
 const token=randomBytes(32).toString('hex');
 const headers=new Headers(request.headers);
 const original=request.headers.get('cookie');
 headers.set('cookie',(original?original+'; ':'')+name+'='+token);
 const response=NextResponse.next({request:{headers}});
 response.cookies.set(name,token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:600});
 response.headers.set('Cache-Control','no-store');
 return response;
}
export const config={matcher:['/login']};
