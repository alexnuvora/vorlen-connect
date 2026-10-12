import {ISSUER,RESOURCE} from '@/lib/mcp-oauth.mjs';
export function GET(){return Response.json({resource:RESOURCE,authorization_servers:[ISSUER],scopes_supported:['mcp'],bearer_methods_supported:['header']},{headers:{'Cache-Control':'public,max-age=300'}});}
