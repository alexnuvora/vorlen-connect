import {z} from 'zod';
import {brokerAction} from './session-broker.mjs';
import {nativeMap,nativeCoverage} from './native-contract.mjs';
import {fail,linkedinId} from './security.mjs';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function nativeInput(op,args={}){
 if(!args||typeof args!=='object'||Array.isArray(args)||args.params!==undefined&&(!args.params||typeof args.params!=='object'||Array.isArray(args.params)))fail('INVALID_INPUT','Arguments and params must be objects.');
 const p={...args};delete p.params;delete p.action;delete p.account_id;
 for(const [k,v]of Object.entries(args.params||{})){if(['account_id','action','params'].includes(k))fail('INVALID_INPUT','Account must be supplied at top level.');if(own(p,k)&&JSON.stringify(p[k])!==JSON.stringify(v))fail('INVALID_INPUT','Conflicting parameter: '+k);p[k]=v;}
 const rename=(a,b)=>{if(own(p,a)){if(own(p,b)&&p[a]!==p[b])fail('INVALID_INPUT','Conflicting parameter: '+b);p[b]=p[a];delete p[a];}};
 rename('offset','start');rename('limit','count');rename('keyword','keywords');
 if(p.cursor!==undefined)fail('UNSUPPORTED_PARAMETER','Use offset pagination for native jobs.');
 if(p.profile_url!==undefined){p.identifier=linkedinId(p.profile_url);delete p.profile_url;}
 if(p.identifier!==undefined)p.identifier=linkedinId(p.identifier);
 if(p.company_url!==undefined){p[op==='profiles.search_people'?'current_company':'identifier']=linkedinId(p.company_url,'company');delete p.company_url;}
 if(p.school_url!==undefined){p.school=linkedinId(p.school_url,'school');delete p.school_url;}
 if(op==='profiles.get_me'&&Object.keys(p).length)fail('INVALID_INPUT','get_me takes no parameters.');
 if(op==='profiles.get'&&!p.identifier)fail('INVALID_INPUT','Profile URL or identifier required.');
 if(op==='send_connection.send')rename('message','content');
 if(op==='send_message.send'){rename('message_text','content');rename('message','content');if(p.media_file||p.media_link)fail('NATIVE_ATTACHMENT_NOT_READY','Native attachments require a verified LinkedIn upload adapter.',422);}
 if(op==='content.get_comments'){
  const value=p.post_url;if(typeof value!=='string')fail('INVALID_INPUT','LinkedIn post_url required.');
  const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.linkedin.com'&&u.hostname!=='linkedin.com'||u.username||u.password)fail('INVALID_INPUT','Use a LinkedIn HTTPS post URL.');
  const m=u.pathname.match(/(?:activity[:\-]|share:|ugcPost:)(\d+)/);if(!m)fail('INVALID_INPUT','Post URL must contain an activity ID.');p.post_id=m[1];delete p.post_url;
 }
 return p;
}
export async function nativeCall(svc,op,args={}){
 const accounts=async()=>(await brokerAction(svc,'list')).map(a=>({...a,account_id:a.id,platform:a.channel||'linkedin',provider:'vorlen_native',country:'GB',webhook_url:null}));
 if(op==='accounts.list'){z.object({include_seats:z.boolean().optional()}).strict().parse(args);if(args.include_seats)fail('RECRUITER_SEATS_NOT_READY','Recruiter seat enumeration requires live verification.',422);return {accounts:await accounts()};}
 if(op==='account.get'){const {account_id}=z.object({account_id:z.string().uuid()}).strict().parse(args);const a=(await accounts()).find(a=>a.id===account_id);if(!a)fail('ACCOUNT_NOT_FOUND','Native account not found.',404);return a;}
 if(op==='credits.get')return {credits:null,billing_model:'native_free_only',automatic_paid_scaling:false};
 if(op==='logs.list')return svc.logs(args);
 if(op==='usage.get')return svc.usage(args);
 const operation=nativeMap[op];if(!operation)fail('NATIVE_CAPABILITY_PENDING',nativeCoverage().find(c=>c.id===op)?.limitation||'Native adapter required.',422);
 const connection_id=z.string().uuid().parse(args.account_id);
 return brokerAction(svc,'enqueue',{connection_id,operation,input:nativeInput(op,args)});
}
