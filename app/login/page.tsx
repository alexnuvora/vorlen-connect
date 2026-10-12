import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{return_to?:string,error?:string}>}) {
 const p=await searchParams;
 const token=(await cookies()).get('__Host-vorlen-login-csrf')?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))redirect('/login/bootstrap');
 const back=typeof p.return_to==='string'&&p.return_to.startsWith('/')&&!p.return_to.startsWith('//')?p.return_to:'/';
 return <main style={{maxWidth:400,margin:'10vh auto',padding:24,fontFamily:'sans-serif'}}><h1>Vorlen Connect</h1><p>Sign in with your authorised account.</p>{p.error&&<p role="alert">Sign-in failed. Check your credentials and try again.</p>}<form method="post" action="/login/session"><input type="hidden" name="csrf" value={token}/><input type="hidden" name="return_to" value={back}/><label htmlFor="email">Email</label><input id="email" type="email" name="email" autoComplete="username" required style={{display:'block',width:'100%',margin:'8px 0 16px'}}/><label htmlFor="password">Password</label><input id="password" type="password" name="password" autoComplete="current-password" required style={{display:'block',width:'100%',margin:'8px 0 16px'}}/><button type="submit">Sign in</button></form></main>;
}
