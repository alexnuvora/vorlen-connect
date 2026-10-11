import {service} from '@/lib/server';
import {LINKEDIN_ORIGIN} from '@/lib/linkedin.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 let result='failed';
 try{const svc=await service();const url=new URL(req.url);const binding=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-vorlen-li='))?.slice('__Host-vorlen-li='.length);if(!url.searchParams.has('error')){await svc.finishLinkedin(url.searchParams.get('state'),binding,url.searchParams.get('code'));result='connected';}}
 catch{/* No OAuth codes, tokens or provider error strings enter logs or URLs. */}
 return new Response(null,{status:303,headers:{Location:LINKEDIN_ORIGIN+'/?tab=connections&linkedin='+result,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Set-Cookie':'__Host-vorlen-li=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
}
