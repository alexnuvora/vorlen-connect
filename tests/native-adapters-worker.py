import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
import unittest
from unittest.mock import patch,MagicMock
import json
import socket
import native_linkedin as li
import native_mail as mail
from session_worker import BrokerError
class Adapters(unittest.TestCase):
 def test_normalized_references_and_projection(self):
  data={'data':{'*elements':['urn:li:one'],'paging':{'start':0,'count':1,'total':2}},'included':[{'entityUrn':'urn:li:one','text':'Hi','li_at':'SECRET','password':'SECRET'}]}
  result=li.collection(data,1,BrokerError)
  self.assertEqual(result['items'][0]['text'],'Hi');self.assertNotIn('SECRET',json.dumps(result));self.assertEqual(result['next_offset'],1)
  with self.assertRaises(BrokerError):li.collection({'wrong':[]},5,BrokerError)
 def test_full_profile_retains_sections_without_tokens(self):
  r=li.full_profile({'profile':{'firstName':'Test','summary':'About','cookie':'SECRET'},'positionView':{'elements':[{'title':'Engineer','companyName':'Example'}]},'educationView':{'elements':[]}},BrokerError)
  self.assertEqual(r['experience'][0]['title'],'Engineer');self.assertEqual(r['education'],[]);self.assertNotIn('SECRET',json.dumps(r))
 def test_ambiguous_conversation_does_not_choose_recipient(self):
  b=MagicMock();b.request.side_effect=[({'profile':{'entityUrn':'urn:li:fs_profile:member'}},200),({'elements':[{'entityUrn':'a'},{'entityUrn':'b'}]},200)]
  with self.assertRaisesRegex(BrokerError,'AMBIGUOUS_CONVERSATION'):li.find_conversation(b,'member',BrokerError)
 def test_search_encodes_restli_metacharacters(self):
  b=MagicMock();b.request.return_value=({'data':{'searchDashClustersByAll':{'elements':[]}}},200)
  li.search(b,'search_people',{'keywords':'a),evil:List(x','count':5},BrokerError)
  params=b.request.call_args.args[1];self.assertNotIn('keywords:a),evil',params['variables']);self.assertIn('%29',params['variables'])
 def test_mail_blocks_private_mixed_and_metadata_addresses(self):
  for ip in ['127.0.0.1','169.254.169.254','10.0.0.1','::1','::ffff:127.0.0.1']:
   with patch('socket.getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',(ip,993))]),patch('socket.socket') as sock:
    with self.assertRaises(mail.MailError):mail.public_socket('imap.example.com',993)
    sock.assert_not_called()
 def test_socket_pins_checked_ip(self):
  fake=MagicMock()
  with patch('socket.getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',993))]) as dns,patch('socket.socket',return_value=fake):
   mail.public_socket('imap.example.com',993);fake.connect.assert_called_once_with(('8.8.8.8',993));dns.assert_called_once()
 def test_email_mime_exact_body_and_deterministic_id(self):
  p={'to':'receiver@example.com','subject':'Test','text':'Exact plain text','html':'<b>Exact HTML</b>','reply_to':'reply@example.com'}
  msg=mail.compose({'email':'sender@example.com'},p,'test-job')
  self.assertEqual(msg['From'],'sender@example.com');self.assertEqual(msg['To'],p['to']);self.assertEqual(msg['Message-ID'],'<vorlen-test-job@example.com>')
  self.assertEqual(msg.get_body(preferencelist=('plain',)).get_content().strip(),p['text'])
  self.assertEqual(msg.get_body(preferencelist=('html',)).get_content().strip(),p['html'])
 def test_read_mail_is_peek_and_readonly(self):
  c=MagicMock();c.__enter__.return_value=c;c.select.return_value=('OK',[])
  c.uid.side_effect=[('OK',[b'9']),('OK',[(b'9 (UID 9 RFC822.SIZE 50 FLAGS ())',b'From: a@example.com\r\nSubject: Test\r\n\r\nHello'),b')'])]
  with patch.object(mail,'imap_connection',return_value=c):r=mail.messages({}, {'unread_only':True})
  c.select.assert_called_once_with('INBOX',readonly=True);self.assertIn('BODY.PEEK',c.uid.call_args_list[1].args[2]);self.assertTrue(r['items'][0]['unread'])
class Research(unittest.TestCase):
 def test_employee_search_resolves_company_before_filtering(self):
  browser=MagicMock();browser.request.return_value=({'elements':[{'entityUrn':'urn:li:fs_company:123','name':'Example'}]},200)
  with patch.object(li,'search',return_value={'items':[]}) as search:
   result=li.read(browser,'employees',{'identifier':'example','count':5},BrokerError)
   self.assertEqual(search.call_args.args[2]['current_company'],'123');self.assertEqual(result['company_name'],'Example')
 def test_job_search_retains_source_and_does_not_invent_empty_results(self):
  browser=MagicMock();browser.request.return_value=({'data':{'elements':[{'jobPosting':{'title':'Engineer'}}],'paging':{'start':0,'total':1}}},200)
  result=li.read(browser,'search_jobs',{'keywords':'engineer','is_remote':True,'job_type':'fulltime'},BrokerError)
  self.assertEqual(result['items'][0]['title'],'Engineer');self.assertEqual(result['aggregated_boards'],['linkedin']);self.assertFalse(result['other_boards_implemented'])
  self.assertIn('workplaceType:List(2)',browser.request.call_args.args[1]['query'])
  browser.request.return_value=({'data':{'elements':[{'unknown':'schema'}]}},200)
  with self.assertRaises(BrokerError):li.read(browser,'search_jobs',{'keywords':'engineer'},BrokerError)
if __name__=='__main__':unittest.main()
