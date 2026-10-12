import importlib.util
import unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'worker'/'browser_broker.py'
spec=importlib.util.spec_from_file_location('broker',p)
broker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)
class BrokerTest(unittest.TestCase):
 def test_loopback_only(self):
  self.assertEqual(broker.BIND,'127.0.0.1')
 def test_capacity_limit(self):
  self.assertLessEqual(broker.MAX_SESSIONS,2)
 def test_ephemeral_ttl(self):
  self.assertLessEqual(broker.TTL,1200)
 def test_no_signin_automation(self):
  source=p.read_text()
  self.assertNotIn('linkedin.com/login',source)
if __name__=='__main__':unittest.main()
