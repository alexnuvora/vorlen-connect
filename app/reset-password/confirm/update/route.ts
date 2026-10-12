import {NextRequest} from 'next/server';
import {changePasswordWithRecoveryToken} from '@/lib/standalone-auth.mjs';
export async function POST(req:NextRequest){
 if(req.headers.get('sec-fetch-site')==='cross-site')return new Response('Forbidden',{status:403});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return new Response('Unsupported format',{status:415});
 if(Number(req.headers.get('content-length')||0)>10000)return new Response('Request too large',{status:413});
 try {
  const body=await req.json();
  if(typeof body.token!=='string'||typeof body.password!=='string')return new Response('Invalid request',{status:400});
  await changePasswordWithRecoveryToken(body.token,body.password);
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return new Response('Invalid or expired reset link',{status:400});}
}
