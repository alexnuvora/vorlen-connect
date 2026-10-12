import {NextRequest,NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {decrypt} from './lib/security.mjs';
import {makeRememberCookie,makeStandaloneCookie,refreshRememberCookie,REMEMBER_COOKIE,STANDALONE_COOKIE,rememberMaxAge} from './lib/standalone-auth.mjs';

const csrfName='__Host-vorlen-login-csrf';
export async function proxy(request:NextRequest){
 const isLogin=request.nextUrl.pathname==='/login';
 const incoming=request.headers.get('cookie')||'';
 const headers=new Headers(request.headers);
 const setCookies:Array<{name:string;value:string;options:{httpOnly:true;secure:true;sameSite:'lax'|'strict';path:'/';maxAge:number}}>=[];
 if(isLogin){
  const current=request.cookies.get(csrfName)?.value;
  if(!current||!/^[a-f0-9]{64}$/.test(current)){
   const token=randomBytes(32).toString('hex');
   headers.set('cookie',(headers.get('cookie')?headers.get('cookie')+'; ':'')+csrfName+'='+token);
   setCookies.push({name:csrfName,value:token,options:{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:600}});
  }
 }
 const saved=request.cookies.get(REMEMBER_COOKIE)?.value;
 if(saved&&process.env.VORLEN_SESSION_KEY&&process.env.SUPABASE_PUBLISHABLE_KEY){
  let valid=false;
  try {
   const current=request.cookies.get(STANDALONE_COOKIE)?.value;
   if(current){
    const v=JSON.parse(await decrypt(current,process.env.VORLEN_SESSION_KEY,'vorlen:standalone:v1'));
    valid=typeof v.exp==='number'&&v.exp>Date.now()+30000;
   }
  }catch{/* expired or invalid cookie */}
  if(!valid){
   const refreshed=await refreshRememberCookie(saved);
   if(refreshed){
    const access=await makeStandaloneCookie(refreshed.token,refreshed.expiresAt);
    const rotated=await makeRememberCookie(refreshed.refreshToken,refreshed.rememberUntil);
    headers.set('cookie',headers.get('cookie')?headers.get('cookie')+'; '+STANDALONE_COOKIE+'='+access+'; '+REMEMBER_COOKIE+'='+rotated:STANDALONE_COOKIE+'='+access+'; '+REMEMBER_COOKIE+'='+rotated);
    setCookies.push({name:STANDALONE_COOKIE,value:access,options:{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:2700}});
    setCookies.push({name:REMEMBER_COOKIE,value:rotated,options:{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:Math.max(0,Math.ceil((refreshed.rememberUntil-Date.now())/1000))}});
   }else{
    setCookies.push({name:REMEMBER_COOKIE,value:'',options:{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0}});
   }
  }
 }
 const response=NextResponse.next({request:{headers}});
 for(const item of setCookies)response.cookies.set(item.name,item.value,item.options);
 if(isLogin)response.headers.set('Cache-Control','no-store');
 return response;
}
export const config={matcher:['/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js)$).*)']};
