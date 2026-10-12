#!/usr/bin/env python3
"""Vorlen restricted worker: only health_probe jobs, no platform automation."""
import json
import os
import signal
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
STOP=False
def stop(_a,_b):
 global STOP
 STOP=True
def api(action, **values):
 url=os.environ['VORLEN_WORKER_API_URL']
 token=os.environ['VORLEN_WORKER_API_TOKEN']
 request=urllib.request.Request(url,data=json.dumps({'action':action,**values}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(request,timeout=15) as response:
  return json.load(response)['data']
def heartbeat(path,mode,detail=None):
 d={'service':'vorlen-worker','mode':mode,'ready':True,'linkedin_actions_enabled':False,'last_heartbeat_utc':datetime.now(timezone.utc).isoformat(),'pid':os.getpid(),'detail':detail}
 tmp=path.with_suffix('.tmp')
 tmp.write_text(json.dumps(d,sort_keys=True)+'\n',encoding='utf-8')
 tmp.replace(path)
def main():
 signal.signal(signal.SIGTERM,stop)
 signal.signal(signal.SIGINT,stop)
 state=Path(os.environ.get('VORLEN_WORKER_STATE_DIR','/var/lib/vorlen-worker'))
 state.mkdir(parents=True,exist_ok=True)
 path=state/'status.json'
 url=os.environ.get('VORLEN_WORKER_API_URL','')
 token=os.environ.get('VORLEN_WORKER_API_TOKEN','')
 enabled=url.startswith('https://') and len(token)>=32
 mode='queue' if enabled else 'standby'
 print('vorlen-worker started in '+mode,flush=True)
 while not STOP:
  detail=None
  if enabled:
   try:
    jobs=api('claim',worker_id='oracle-vorlen-1')
    for job in jobs[:1]:
     if job['kind']=='health_probe':
      result={'ok':True,'handled_by':'oracle-vorlen-1'}
      api('finish',id=job['id'],lease_token=job['lease_token'],success=True,result=result)
      detail='completed health_probe'
     else:
      api('finish',id=job['id'],lease_token=job['lease_token'],success=False,error='Unsupported job kind')
      detail='unsupported job rejected'
   except Exception as e:
    detail='queue temporarily unavailable: '+type(e).__name__
  heartbeat(path,mode,detail)
  for _ in range(15):
   if STOP:break
   time.sleep(1)
 print('vorlen-worker stopped',flush=True)
if __name__=='__main__':main()
