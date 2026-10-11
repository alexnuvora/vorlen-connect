// Read-only integration check. Credentials arrive only over non-echo stdin.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {ZernioClient} from '../lib/zernio.mjs';
console.log('Ready for secure Zernio integration JSON');
const rl=createInterface({input:process.stdin,terminal:false});const config=await new Promise(resolve=>rl.once('line',line=>{rl.close();resolve(JSON.parse(line));}));
const fetcher=(url,o)=>new Promise((resolve,reject)=>{if(o.method!=='GET')throw Error('Read-only verification');const cfg=['silent','show-error','max-time = 30','url = '+JSON.stringify(String(url))];for(const[k,v]of Object.entries(o.headers))cfg.push('header = '+JSON.stringify(k+': '+v));const child=spawn('curl',['--config','-','--write-out','\n%{http_code}'],{stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',v=>out+=v);child.stderr.resume();child.on('error',reject);child.on('close',code=>{if(code)return reject(Error('Transport failed'));const cut=out.lastIndexOf('\n');resolve(new Response(out.slice(0,cut),{status:Number(out.slice(cut+1))}));});child.stdin.end(cfg.join('\n'));});
const c=new ZernioClient(config.key,fetcher);const accounts=await c.accounts();console.log(JSON.stringify({check:'accounts',count:accounts.items.length,accounts:accounts.items}));
const linkedin=accounts.items.find(a=>a.platform==='linkedin');
const checks=[['profiles',()=>c.read('list_profiles')],['posts',()=>c.read('list_posts',{limit:3})],...(linkedin?[['linkedin_analytics',()=>c.read('linkedin_analytics',{account_id:linkedin.id})],['account_health',()=>c.read('account_health',{account_id:linkedin.id})]]:[])];
const results=await Promise.allSettled(checks.map(async([name,run])=>{const r=await run();console.log(JSON.stringify({check:name,ok:true,keys:Object.keys(r),count:r.posts?.length??r.profiles?.length,status:r.status||null}));}));let failed=false;results.forEach((r,i)=>{if(r.status==='rejected'){failed=true;console.log(JSON.stringify({check:checks[i][0],ok:false,code:r.reason.code,message:r.reason.message}));}});process.exitCode=failed?1:0;
