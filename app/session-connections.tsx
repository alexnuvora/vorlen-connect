'use client';
import {useEffect,useState,FormEvent} from 'react';

type Connection={
 id:string;label:string;state:string;verification_required:boolean;
 verification_kind:string|null;profile_id:string|null;last_verified_at:string|null;
 expires_at:string|null;revision:number;last_error_code:string|null;
};
type SessionResponse={success:boolean;data?:Connection[]|{id?:string;revoked?:boolean};error?:{message?:string}};

const STATES:Record<string,string>={
 disconnected:'Record only — not connected',
 awaiting_login:'Awaiting approved authentication',
 verification_required:'Verification required with provider',
 connected:'Verified session',
 expired:'Expired',
 revoked:'Local record removed',
 error:'Connection error',
};
export default function SessionConnections(){
 const [list,setList]=useState<Connection[]>([]);
 const [label,setLabel]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 async function request(action?:'create'|'revoke',id?:string){
  const response=await fetch('/api/v1/linkedin/sessions',{
   method:action?'POST':'GET',
   headers:action?{'Content-Type':'application/json'}:undefined,
   body:action?JSON.stringify(action==='create'?{action,label:label.trim()}:{action,id}):undefined,
   credentials:'same-origin',
   cache:'no-store'
  });
  const result:SessionResponse=await response.json();
  if(!response.ok||!result.success)throw Error(result.error?.message||'Unable to contact session service.');
  return result.data;
 }
 async function refresh(){
  const rows=await request();
  setList(Array.isArray(rows)?rows:[]);
 }
 useEffect(()=>{void refresh().catch(e=>setError(String(e.message||e))).finally(()=>setLoading(false));},[]);
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setMessage('');setBusy(true);
  try{
   await request('create');
   setLabel('');
   await refresh();
   setMessage('Local connection record created. No LinkedIn account has been connected.');
  }catch(e){setError(String((e as Error).message||e));}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  if(!window.confirm('Remove this local session record? This does not sign out or revoke any remote LinkedIn session.'))return;
  setError('');setMessage('');setBusy(true);
  try{await request('revoke',id);await refresh();setMessage('Local record removed. Remote LinkedIn sessions are unchanged.');}
  catch(e){setError(String((e as Error).message||e));}
  finally{setBusy(false);}
 }
 return <section className="panel" aria-labelledby="session-records-heading">
  <div className="section-title"><h2 id="session-records-heading">Session integration · connection records</h2><span className="pill amber">Foundation only</span></div>
  <p>This section manages Vorlen-owned connection records. It cannot log into LinkedIn or read messages yet. For working LinkedIn profile access and publishing, use the authorised OAuth connection above.</p>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {message&&<p className="notice" role="status">{message}</p>}
  <form onSubmit={create}>
   <label>Connection label<input value={label} onChange={e=>setLabel(e.target.value)} minLength={1} maxLength={100} autoComplete="off" placeholder="e.g. Recruitment account" required/></label>
   <button className="secondary" disabled={busy||!label.trim()}>Create local record</button>
  </form>
  {loading?<p role="status">Loading connection records…</p>:list.length===0?<p>No session records yet.</p>:
   <div className="table-wrap"><table>
    <thead><tr><th>Connection</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{list.map(item=><tr key={item.id}>
     <td><strong>{item.label}</strong><p className="field-note">{item.id}</p></td>
     <td>{STATES[item.state]||'Unknown'}{item.verification_required&&<p className="field-note">Provider verification: {item.verification_kind||'required'}</p>}</td>
     <td><button className="secondary" type="button" disabled={busy||item.state==='revoked'} onClick={()=>void remove(item.id)}>Remove local record</button></td>
    </tr>)}</tbody>
   </table></div>}
  <p className="field-note">Verification and session creation require a supported provider integration. Never enter your LinkedIn password or verification code in this form.</p>
 </section>;
}
