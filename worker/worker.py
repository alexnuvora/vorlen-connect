#!/usr/bin/env python3
"""Vorlen restricted queue worker. Public LinkedIn jobs only; no account automation."""
import base64, hashlib, json, os, signal, subprocess, time, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path
from native_jobs import run_job

STOP=False
def stop(_a,_b):
 global STOP
 STOP=True

def api(action, **values):
 url=os.environ['VORLEN_WORKER_API_URL']
 body=json.dumps({'action':action,**values},separators=(',',':'),ensure_ascii=False).encode()
 timestamp=str(int(time.time()*1000));nonce=str(uuid.uuid4())
 message=(timestamp+'\\n'+nonce+'\\n'+hashlib.sha256(body).hexdigest()).encode()
 key_path=Path('/var/lib/vorlen-session/signing.pem')
 signature=subprocess.run(['openssl','pkeyutl','-sign','-rawin','-inkey',str(key_path)],input=message,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=5).stdout
 headers={'Content-Type':'application/json','X-Vorlen-Timestamp':timestamp,'X-Vorlen-Nonce':nonce,'X-Vorlen-Signature':base64.b64encode(signature).decode()}
 req=urllib.request.Request(url,data=body,headers=headers,method='POST')
 with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)['data']

def heartbeat(path,mode,detail=None):
 d={'service':'vorlen-worker','mode':mode,'ready':True,'linkedin_actions_enabled':False,'public_jobs_collection_enabled':mode=='queue','last_heartbeat_utc':datetime.now(timezone.utc).isoformat(),'pid':os.getpid(),'detail':detail}
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(d,sort_keys=True)+'\n',encoding='utf-8');tmp.replace(path)

def main():
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 state=Path(os.environ.get('VORLEN_WORKER_STATE_DIR','/var/lib/vorlen-worker'));state.mkdir(parents=True,exist_ok=True);path=state/'status.json'
 url=os.environ.get('VORLEN_WORKER_API_URL','');key_path=Path('/var/lib/vorlen-session/signing.pem')
 enabled=url.startswith('https://') and key_path.is_file()
 mode='queue' if enabled else 'standby'
 print('vorlen-worker started in '+mode,flush=True)
 while not STOP:
  detail=None
  if enabled:
   try:
    response=api('claim',worker_id='oracle-vorlen-1')
    rows=response.get('rows',[]) if isinstance(response,dict) else []
    if rows:
     job=rows[0];kind=job.get('kind')
     if kind=='linkedin_public_jobs':
      payload=job.get('payload') or {};filters=payload.get('filters') or {}
      def save(result):
       ok=api('progress',id=job['id'],lease_token=job['lease_token'],result=result)
       if ok is False:raise RuntimeError('lease expired while saving progress')
      result=run_job(filters,save)
      api('finish',id=job['id'],lease_token=job['lease_token'],success=True,result=result)
      detail='completed native public jobs search: '+str(result.get('returned',0))+' items'
     elif kind=='health_probe':
      api('finish',id=job['id'],lease_token=job['lease_token'],success=True,result={'ok':True,'handled_by':'oracle-vorlen-1'})
      detail='completed health_probe'
     else:
      api('finish',id=job['id'],lease_token=job['lease_token'],success=False,error='Unsupported job kind')
      detail='unsupported job rejected'
   except Exception as e:
    detail='queue/job error: '+type(e).__name__
    print(detail,flush=True)
  heartbeat(path,mode,detail)
  for _ in range(5):
   if STOP:break
   time.sleep(1)
 print('vorlen-worker stopped',flush=True)
if __name__=='__main__':main()
