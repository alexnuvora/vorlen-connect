'use client';
import {useEffect,useState} from 'react';
export default function PasswordForm(){
 const [token,setToken]=useState('');
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 const [message,setMessage]=useState('');
 const [done,setDone]=useState(false);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.hash.slice(1));
  const access=params.get('access_token');
  if(params.get('type')==='recovery'&&access)queueMicrotask(()=>setToken(access));
  window.history.replaceState(null,'',window.location.pathname);
 },[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(password.length<12||password!==confirm){setMessage('Use at least 12 characters and make sure your passwords match.');return;}
  setLoading(true);setMessage('');
  try{const res=await fetch('/reset-password/confirm/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password})});if(!res.ok)throw new Error('This link may have expired. Request a new reset link.');setDone(true);setToken('');setPassword('');setConfirm('');}
  catch(e){setMessage(e instanceof Error?e.message:'Unable to reset password.');}
  finally{setLoading(false);}
 }
 return <div className="vl-form-wrap"><div className="vl-form-eyebrow">ACCOUNT RECOVERY</div><h2>Choose a new password</h2>{done?<><div className="vl-success">Your password has been updated.</div><p><a href="/login">Go to sign in →</a></p></>:!token?<><p className="vl-subheading">The reset link is missing or invalid. Open the recovery link from your email or request another.</p><a href="/reset-password">Request a new link</a></>:<form onSubmit={submit}><p className="vl-subheading">Set a unique password with at least 12 characters.</p><label className="vl-field" htmlFor="new-password">New password</label><input className="vl-input" id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/><label className="vl-field vl-password-label" htmlFor="confirm-password">Confirm password</label><input className="vl-input" id="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)}/>{message&&<div className="vl-error" role="alert">{message}</div>}<button className="vl-submit" disabled={loading}> {loading?'Updating…':'Update password'} <span>→</span></button></form>}</div>;
}
