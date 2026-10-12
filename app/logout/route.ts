import {NextResponse} from 'next/server';
import {STANDALONE_COOKIE,REMEMBER_COOKIE} from '@/lib/standalone-auth.mjs';
export const dynamic='force-dynamic';
export async function GET(){
 const res=new NextResponse(null,{status:303,headers:{Location:'/login','Cache-Control':'no-store'}});
 res.cookies.set(STANDALONE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
 res.cookies.set(REMEMBER_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
 return res;
}
