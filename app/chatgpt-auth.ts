import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {SESSION_COOKIE,sessionUser,safeReturn,validBearer} from '@/lib/auth-tokens.mjs';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 const origin=process.env.APP_ORIGIN,owner=process.env.ZERNIO_OWNER_ID;
 if(!origin||!owner)return null;
 // Vercel has no trusted Sites identity headers. Only verified session credentials count.
 const h=await headers();
 if(await validBearer(h.get('authorization'),process.env.VORLEN_MCP_API_KEY))return {userId:owner,displayName:'Workspace owner',email:process.env.VORLEN_OWNER_EMAIL||'',fullName:null};
 const jar=await cookies();
 return sessionUser(jar.get(SESSION_COOKIE)?.value,process.env.VORLEN_SESSION_KEY,origin,owner);
}
export async function requireChatGPTUser(returnTo:string):Promise<ChatGPTUser>{const user=await getChatGPTUser();if(user)return user;redirect(chatGPTSignInPath(returnTo));}
export function chatGPTSignInPath(returnTo:string){return '/signin-with-chatgpt?return_to='+encodeURIComponent(safeReturn(returnTo));}
export function chatGPTSignOutPath(returnTo='/'){return '/signout-with-chatgpt?return_to='+encodeURIComponent(safeReturn(returnTo));}
