import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import './login.css';
export const dynamic='force-dynamic';

export default async function Login({searchParams}:{searchParams:Promise<{return_to?:string;error?:string}>}) {
 const p=await searchParams;
 const back=typeof p.return_to==='string'&&p.return_to.startsWith('/')&&!p.return_to.startsWith('//')?p.return_to:'/';
 if(await getChatGPTUser())redirect(back);
 const token=(await cookies()).get('__Host-vorlen-login-csrf')?.value||'';
 return <main className="vl-login">
   <section className="vl-story" aria-label="About Vorlen Connect">
     <div className="vl-wordmark"><span className="vl-logomark">V<span>.</span></span><span>vorlen <strong>connect</strong></span></div>
     <div className="vl-story-content">
       <div className="vl-eyebrow"><span className="vl-dot"/> YOUR CONNECTED WORKSPACE</div>
       <h1>Better connections.<br/><em>Stronger relationships.</em></h1>
       <p>Manage your professional outreach, conversations and opportunities from one beautifully connected place.</p>
       <div className="vl-story-line"/>
       <div className="vl-story-caption">One workspace. Every important connection.</div>
     </div>
     <div className="vl-story-footer">© {new Date().getFullYear()} Vorlen. All rights reserved.</div>
   </section>
   <section className="vl-form-panel">
     <div className="vl-mobile-logo"><span className="vl-logomark">V<span>.</span></span> vorlen <strong>connect</strong></div>
     <div className="vl-form-wrap">
       <div className="vl-form-eyebrow">WELCOME BACK</div>
       <h2>Sign in to your workspace</h2>
       <p className="vl-subheading">Enter your details below to continue to Vorlen Connect.</p>
       {p.error&&<div className="vl-error" role="alert">We couldn't sign you in. Please check your details and try again.</div>}
       <form method="post" action="/login/session">
         <input type="hidden" name="csrf" value={token}/>
         <input type="hidden" name="return_to" value={back}/>
         <label className="vl-field" htmlFor="email">Email address</label>
         <input className="vl-input" id="email" type="email" name="email" placeholder="name@company.com" autoComplete="username" autoCapitalize="none" required/>
         <label className="vl-field vl-password-label" htmlFor="password">Password</label>
         <input className="vl-input" id="password" type="password" name="password" placeholder="Enter your password" autoComplete="current-password" required/>
         <div className="vl-actions"><label><input type="checkbox" name="remember" value="yes" defaultChecked/> Stay signed in</label><a href="/reset-password">Forgot password?</a></div>
         <button className="vl-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
       </form>
       <div className="vl-secure"><span aria-hidden="true">◇</span> Your workspace is protected with secure authentication</div>
     </div>
     <div className="vl-help">Need help? <a href="mailto:contact@vorlen.co.uk">Contact support</a></div>
   </section>
 </main>;
}
