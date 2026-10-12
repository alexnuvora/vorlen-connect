import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {requestPasswordReset} from '@/lib/standalone-auth.mjs';
export async function POST(req:NextRequest){
 if(req.headers.get('sec-fetch-site')==='cross-site')return new Response('Forbidden',{status:403});
 if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Unsupported format',{status:415});
 const form=await req.formData();
 const csrf=form.get('csrf'),stored=req.cookies.get('__Host-vorlen-login-csrf')?.value;
 if(typeof csrf!=='string'||typeof stored!=='string'||!/^[a-f0-9]{64}$/.test(csrf)||!/^[a-f0-9]{64}$/.test(stored)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(stored)))return new Response('Invalid form',{status:403});
 const email=form.get('email');
 if(typeof email==='string'&&email.length<=320){
  try{await requestPasswordReset(email,'https://connect.vorlen.co.uk/reset-password/confirm');}catch{/* Do not reveal account details */}
 }
 return new NextResponse(null,{status:303,headers:{Location:'/reset-password?sent=1','Cache-Control':'no-store'}});
}
