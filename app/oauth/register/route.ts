import {randomToken,store,validRedirect,oauthError,authHeaders} from '@/lib/mcp-oauth.mjs';
export async function POST(req:Request){
 try{
  if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return oauthError('invalid_client_metadata',415);
  if(Number(req.headers.get('content-length')||0)>8192)return oauthError('invalid_client_metadata',413);
  const p=await req.json() as Record<string,unknown>;
  if(!Array.isArray(p.redirect_uris)||p.redirect_uris.length<1||p.redirect_uris.length>5||!p.redirect_uris.every(x=>typeof x==='string'&&validRedirect(x)))return oauthError('invalid_redirect_uri');
  if(p.token_endpoint_auth_method&&p.token_endpoint_auth_method!=='none')return oauthError('invalid_client_metadata');
  if(p.grant_types&&(!Array.isArray(p.grant_types)||!p.grant_types.includes('authorization_code')||!p.grant_types.every(x=>x==='authorization_code'||x==='refresh_token')))return oauthError('invalid_client_metadata');
  const client_id='vc_'+randomToken(),client_name=typeof p.client_name==='string'?p.client_name.slice(0,160):'ChatGPT MCP Client';
  const result=await store('register',{client_id,client_name,redirect_uris:[...new Set(p.redirect_uris)]});
  if(result.changes!==1)return oauthError('server_error',503);
  return Response.json({client_id,client_name,redirect_uris:p.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},{status:201,headers:authHeaders});
 }catch{return oauthError('invalid_client_metadata');}
}
