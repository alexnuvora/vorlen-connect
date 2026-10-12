import importlib.util
import sys
import json
from pathlib import Path
import os
import tempfile
import time
import unittest
import uuid
from cryptography.exceptions import InvalidTag
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
spec=importlib.util.spec_from_file_location('worker',Path(__file__).resolve().parents[1]/'worker/session_worker.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
class VaultTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  (self.root/'vault.key').write_bytes(os.urandom(32));self.vault=worker.Vault(self.root);self.cid=str(uuid.uuid4())
 def tearDown(self): self.tmp.cleanup()
 def test_encryption_and_owner_binding(self):
  self.vault.save('alice',self.cid,{'expires':time.time()+60,'storage':{'li_at':'private-test'}})
  path=self.vault.path('alice',self.cid)
  self.assertNotIn(b'private-test',path.read_bytes());self.assertEqual(path.stat().st_mode&0o777,0o600)
  self.vault.path('bob',self.cid).write_bytes(path.read_bytes())
  with self.assertRaises(InvalidTag): self.vault.load('bob',self.cid)
 def test_expiry_and_revocation_delete_state(self):
  self.vault.save('alice',self.cid,{'expires':0})
  with self.assertRaises(worker.BrokerError): self.vault.load('alice',self.cid)
  self.assertFalse(self.vault.path('alice',self.cid).exists())
  self.vault.save('alice',self.cid,{'expires':time.time()+60})
  self.vault.prune('alice',[]);self.assertFalse(self.vault.path('alice',self.cid).exists())
 def test_provider_data_projection_excludes_session_material(self):
  result=worker.clean_records({'elements':[{'entityUrn':'conversation:1','li_at':'private-cookie','text':'Hello'}],'paging':{'count':1}},1)
  self.assertNotIn('private-cookie',json.dumps(result));self.assertEqual(result['items'][0]['text'],['Hello'])
  with self.assertRaises(worker.BrokerError):worker.clean_records({'unknownShape':[]},10)
if __name__=='__main__':unittest.main()
