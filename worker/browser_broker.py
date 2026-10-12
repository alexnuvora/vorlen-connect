#!/usr/bin/env python3
"""Local-only interactive browser broker with isolated ephemeral contexts.

This service does not programmatically sign in to LinkedIn, solve challenges,
scrape inboxes or export authentication cookies. Account owner interacts with
the browser via an independently secured access channel, which must be
configured before any remote exposure.
"""
import json
import os
import secrets
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(os.environ.get('VORLEN_BROKER_STATE_DIR','/var/lib/vorlen-browser'))
BIND='127.0.0.1'
PORT=int(os.environ.get('VORLEN_BROKER_PORT','8765'))
MAX_SESSIONS=2
TTL=1200
sessions={}
lock=threading.Lock()

def reap():
 with lock:
  for sid,s in list(sessions.items()):
   if time.time()-s['started']>TTL or s['proc'].poll() is not None:
    try:s['proc'].terminate()
    except ProcessLookupError:pass
    shutil.rmtree(s['dir'],ignore_errors=True)
    sessions.pop(sid,None)

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,status,payload):
  raw=json.dumps(payload).encode()
  self.send_response(status)
  self.send_header('Content-Type','application/json')
  self.send_header('Cache-Control','no-store')
  self.send_header('Content-Length',str(len(raw)))
  self.end_headers()
  self.wfile.write(raw)
 def do_GET(self):
  reap()
  if self.path!='/health':
   return self.respond(404,{'error':'not found'})
  with lock:self.respond(200,{'ready':True,'browser_available':bool(shutil.which('chromium') or shutil.which('chromium-browser')),'active_sessions':len(sessions),'max_sessions':MAX_SESSIONS,'authentication':'operator-local-only'})
 def do_POST(self):
  # Future authenticated handoff. Never expose remote start without an
  # independently authorised transport, CSRF and per-owner binding.
  self.respond(403,{'error':'Interactive start is disabled until an authenticated owner handoff is configured'})

def main():
 ROOT.mkdir(parents=True,exist_ok=True)
 os.chmod(ROOT,0o700)
 server=ThreadingHTTPServer((BIND,PORT),Handler)
 print('browser broker listening on loopback only',flush=True)
 try:server.serve_forever(poll_interval=1)
 finally:server.server_close()
if __name__=='__main__':main()
