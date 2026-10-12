import { service } from '@/lib/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ISSUER } from '@/lib/mcp-oauth.mjs';
import { directTools as publicTools,resolveDirectTool as resolveTool } from '@/lib/direct-catalog.mjs';
import { assertOrigin,boundedBody,fail } from '@/lib/security.mjs';
import { publicError } from '@/lib/service.mjs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(!await getChatGPTUser())return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{'Content-Type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`,'Cache-Control':'no-store'}});
 let id:string|number|null=null;try{
 assertOrigin(req);const body=await boundedBody(req);id=body.id??null;
 if(body.jsonrpc!=='2.0'||typeof body.method!=='string')return json({jsonrpc:'2.0',id,error:{code:-32600,message:'Invalid request'}},400);
 if(body.method==='notifications/initialized')return new Response(null,{status:202});
 let result:unknown;
 if(body.method==='initialize')result={protocolVersion:['2025-11-25','2025-06-18','2025-03-26','2024-11-05'].includes(body.params?.protocolVersion)?body.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'vorlen-connect',version:'0.3.0'},instructions:'Check capabilities for incomplete parity. Outbound tools create drafts. The owner reviews and sends in the dashboard.'};
 else if(body.method==='ping')result={};
 else if(body.method==='tools/list')result={tools:publicTools()};
 else if(body.method==='tools/call'){
 const svc=await service();let resolved;try{resolved=resolveTool(body.params?.name,body.params?.arguments||{});}catch{fail('UNKNOWN_TOOL','Unknown tool.',404);}
 try{const data=await svc.call(resolved!.operation,resolved!.args);result={content:[{type:'text',text:JSON.stringify(data)}],isError:false};}catch(e){const r=publicError(e);result={content:[{type:'text',text:JSON.stringify({error:r.error})}],isError:true};}
 }else return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
 return json({jsonrpc:'2.0',id,result});
 }catch(e){const r=publicError(e);return json({jsonrpc:'2.0',id,error:{code:r.status===401?-32001:-32603,message:r.error.message}},r.status);}}
export async function GET(){return new Response('Stateless MCP: use POST.',{status:405,headers:{Allow:'POST'}});}
