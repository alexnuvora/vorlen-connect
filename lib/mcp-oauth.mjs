import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {SupabaseStore} from './supabase-store.mjs';
export const ISSUER='https://connect.vorlen.co.uk';
export const RESOURCE=ISSUER+'/mcp';
export const ACCESS_TTL=3600;
const owner=()=>{if(!process.env.ZERNIO_OWNER_ID)throw Error('Owner configuration missing');return process.env.ZERNIO_OWNER_ID;};
const db=()=>new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,owner());
export const randomToken=()=>randomBytes(32).toString('base64url');
export const digest=t=>createHash('sha256').update(t).digest('hex');
export const challenge=v=>createHash('sha256').update(v).digest('base64url');
export async function store(action,params={}){return db().rpc('oauth_'+action,params);}
export function validRedirect(uri){
 try{const u=new URL(uri);return !u.username&&!u.password&&!u.hash&&u.href.length<=1500&&((u.protocol==='https:'&&!!u.hostname)||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)));}catch{return false;}
}
export const validClientId=x=>typeof x==='string'&&/^vc_[A-Za-z0-9_-]{24,80}$/.test(x);
export const validResource=x=>x===RESOURCE;
export const authHeaders={'Cache-Control':'no-store','Pragma':'no-cache'};
export const requireOAuth=(req)=>{const u=new URL(req.url);if(u.origin!==ISSUER)throw Error('Invalid issuer host');};
export const validPkce=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(x);
export async function verifyOAuthBearer(header){
 const m=/^Bearer ([A-Za-z0-9_-]{30,200})$/.exec(header||'');if(!m)return false;
 try{const r=await store('verify',{secret_hash:digest(m[1]),resource:RESOURCE});return r.rows.length===1&&r.rows[0].owner===owner();}catch{return false;}
}
export async function registered(clientId,redirect){
 if(!validClientId(clientId)||!validRedirect(redirect))return null;
 const r=await store('client',{client_id:clientId});
 const client=r.rows[0];
 return client&&Array.isArray(client.redirect_uris)&&client.redirect_uris.includes(redirect)?client:null;
}
export function safeRedirect(url,code,state){
 const u=new URL(url);u.searchParams.set('code',code);if(state)u.searchParams.set('state',state);return u.href;
}
export function oauthError(error,status=400){return Response.json({error},{status,headers:authHeaders});}
