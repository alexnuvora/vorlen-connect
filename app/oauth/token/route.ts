import {randomToken,digest,challenge,store,validClientId,validPkce,validResource,ACCESS_TTL,oauthError,authHeaders} from '@/lib/mcp-oauth.mjs';
export async function POST(req:Request){
 try{
  if(req.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')return oauthError('invalid_request',415);
  if(Number(req.headers.get('content-length')||0)>12000)return oauthError('invalid_request',413);
  const form=await req.formData();
  const get=(s:string)=>{const v=form.get(s);return typeof v==='string'?v:'';};
  const kind=get('grant_type'),client_id=get('client_id'),resource=get('resource');
  if(!validClientId(client_id)||!validResource(resource))return oauthError('invalid_request');
  const access_token=randomToken(),refresh_token=randomToken(),params:any={client_id,resource,access_hash:digest(access_token),refresh_hash:digest(refresh_token)};
  let action;
  if(kind==='authorization_code'){
   const code=get('code'),verifier=get('code_verifier'),redirect_uri=get('redirect_uri');
   if(!code||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!redirect_uri)return oauthError('invalid_grant');
   Object.assign(params,{secret_hash:digest(code),pkce_challenge:challenge(verifier),redirect_uri});action='exchange';
  }else if(kind==='refresh_token'){if(!get('refresh_token'))return oauthError('invalid_grant');params.secret_hash=digest(get('refresh_token'));action='refresh';}
  else return oauthError('unsupported_grant_type');
  const result=await store(action,params);
  if(result.changes!==1)return oauthError('invalid_grant');
  return Response.json({access_token,token_type:'Bearer',expires_in:ACCESS_TTL,refresh_token,scope:'mcp'},{headers:authHeaders});
 }catch{return oauthError('server_error',503);}
}
