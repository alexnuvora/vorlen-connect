import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {safeReturn,validBearer} from '@/lib/auth-tokens.mjs';
import {STANDALONE_COOKIE,standaloneConfigured,readStandaloneCookie} from '@/lib/standalone-auth.mjs';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 const origin=process.env.APP_ORIGIN,owner=process.env.ZERNIO_OWNER_ID;
 if(!origin||!owner)return null;
 // Vercel has no trusted Sites identity headers. Only verified session credentials count.
 const h=await headers();
 if(await validBearer(h.get('authorization'),process.env.VORLEN_MCP_API_KEY))return {userId:owner,displayName:'Workspace owner',email:process.env.VORLEN_OWNER_EMAIL||'',fullName:null};
 const jar=await cookies();
 if(!standaloneConfigured())return null;
 return readStandaloneCookie(jar.get(STANDALONE_COOKIE)?.value);
}
export async function requireChatGPTUser(returnTo:string):Promise<ChatGPTUser>{const user=await getChatGPTUser();if(user)return user;redirect(chatGPTSignInPath(returnTo));}
export function chatGPTSignInPath(returnTo:string){return '/login?return_to='+encodeURIComponent(safeReturn(returnTo));}
export function chatGPTSignOutPath(returnTo='/'){return '/logout?return_to='+encodeURIComponent(safeReturn(returnTo));}
