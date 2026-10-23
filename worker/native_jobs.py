"""Public LinkedIn guest jobs collector for the isolated Oracle worker.
No login cookies, session reuse, challenge bypass, proxy rotation or retry loops.
"""
from html.parser import HTMLParser
from html import unescape
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json, re, time
from urllib.parse import urlsplit

HOST = "https://www.linkedin.com"
SEARCH = HOST + "/jobs-guest/jobs/api/seeMoreJobPostings/search"
DETAIL = HOST + "/jobs-guest/jobs/api/jobPosting/"
def claim_rows(response):
 """Normalize the existing worker RPC response (list) and wrapped test responses."""
 if isinstance(response, list): return response
 if isinstance(response, dict) and isinstance(response.get("rows"), list): return response["rows"]
 return []

FIELD_NAMES = [
 "job_id","job_url","apply_url","job_title","search_keyword","company_name",
 "company_url","company_logo_url","location","time_posted","posted_date",
 "hiring_badge","is_actively_hiring","is_early_applicant","num_applicants",
 "salary_range","job_description","job_description_raw_html","seniority_level",
 "employment_type","job_function","industries","easy_apply","contact_email"
]

class Node:
 def __init__(self, tag, attrs=None, parent=None):
  self.tag=tag; self.attrs=dict(attrs or []); self.children=[]; self.parent=parent
 def cls(self):
  return set((self.attrs.get("class") or "").split())
 def text(self):
  parts=[]
  def walk(n):
   if isinstance(n,str): parts.append(n); return
   if n.tag in ("br",): parts.append("\n"); return
   for c in n.children: walk(c)
   if n.tag in ("p","div","li","h1","h2","h3","h4","section"): parts.append("\n")
  walk(self)
  return re.sub(r"[ \t\r\f\v]+"," ","".join(parts)).strip()

class DOM(HTMLParser):
 VOID={"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
 def __init__(self,html):
  super().__init__(convert_charrefs=True); self.root=Node("root"); self.stack=[self.root]
  try:self.feed(html)
  except Exception:pass
 def handle_starttag(self,tag,attrs):
  node=Node(tag,attrs,self.stack[-1]);self.stack[-1].children.append(node)
  if tag not in self.VOID:self.stack.append(node)
 def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs); self.handle_endtag(tag)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag: del self.stack[i:]; return
 def handle_data(self,data): self.stack[-1].children.append(data)
 def walk(self,node=None):
  node=node or self.root
  for c in node.children:
   if isinstance(c,Node):
    yield c
    yield from self.walk(c)
 def find(self,cls,node=None):
  for n in self.walk(node):
   if cls in n.cls(): return n
  return None

def safe_url(value,base=HOST):
 if not value:return None
 try:
  u=urlparse(urljoin(base,unescape(value.strip())))
  return u.geturl() if u.scheme in ("http","https") else None
 except Exception:return None

def first_text(dom,classes,node=None):
 for cls in classes:
  found=dom.find(cls,node)
  if found and found.text():return found.text()
 return None

def request_text(url):
 req=Request(url,headers={"Accept":"text/html","Accept-Encoding":"identity","Connection":"close","User-Agent":"Mozilla/5.0 (compatible; VorlenPublicJobs/1.0; +https://vorlen.co.uk)","Accept-Language":"en-GB,en;q=0.8"})
 print("collector request start",urlsplit(url).path,flush=True)
 try:
  with urlopen(req,timeout=15) as r:
   if r.status!=200: raise RuntimeError("SOURCE_HTTP_"+str(r.status))
   raw=r.read(2_000_000)
   print("collector response",urlsplit(url).path,"status",r.status,"bytes",len(raw),flush=True)
   return raw.decode("utf-8","replace")
 except HTTPError as e:
  if e.code in (403,429):raise RuntimeError("SOURCE_ACCESS_RESTRICTED_HTTP_"+str(e.code))
  raise RuntimeError("SOURCE_HTTP_"+str(e.code))
 except URLError as e:raise RuntimeError("SOURCE_NETWORK_"+type(e.reason).__name__)

def blank(job_id,keyword):
 out={k:None for k in FIELD_NAMES};out["job_id"]=job_id
 out["job_url"]=HOST+"/jobs/view/"+job_id;out["search_keyword"]=keyword
 return out

def parse_cards(source,keyword):
 dom=DOM(source);out=[];seen=set()
 for li in dom.walk():
  if li.tag!="li":continue
  anchor=None
  for n in dom.walk(li):
   href=n.attrs.get("href","")
   if "/jobs/view/" in href:
    anchor=n;break
  if not anchor:continue
  match=re.search(r"/jobs/view/(?:[^/?#]*-)?(\d{6,})",anchor.attrs.get("href",""))
  if not match:continue
  job_id=match.group(1)
  if job_id in seen:continue
  seen.add(job_id);j=blank(job_id,keyword)
  j["job_url"]=safe_url(anchor.attrs.get("href")) or j["job_url"]
  j["job_title"]=first_text(dom,["base-search-card__title","job-search-card__title"],li)
  j["company_name"]=first_text(dom,["base-search-card__subtitle","job-search-card__subtitle"],li)
  j["location"]=first_text(dom,["job-search-card__location"],li)
  for n in dom.walk(li):
   if n.tag=="time":
    j["posted_date"]=n.attrs.get("datetime");j["time_posted"]=n.text() or None;break
  for n in dom.walk(li):
   if n.tag=="img":
    j["company_logo_url"]=safe_url(n.attrs.get("data-delayed-url") or n.attrs.get("src"));break
  out.append(j)
 return out

def parse_detail(source,card):
 dom=DOM(source);j=dict(card)
 desc=next((n for n in dom.walk() if n.cls() & {"show-more-less-html__markup","description__text","jobs-description-content__text"}),None)
 if desc:
  j["job_description_raw_html"]=None
  j["job_description"]=desc.text()[:6000] or None
 title=first_text(dom,["top-card-layout__title","topcard__title"])
 if title:j["job_title"]=title
 company=dom.find("topcard__org-name-link")
 if company:
  j["company_name"]=company.text() or j.get("company_name")
  j["company_url"]=safe_url(company.attrs.get("href"))
 all_text=dom.root.text()
 for n in dom.walk():
  if n.tag=="time" and n.attrs.get("datetime"):j["posted_date"]=n.attrs["datetime"];break
 applicant=re.search(r"\b(Over\s+[\d,]+\s+applicants?|More than\s+[\d,]+\s+applicants?|[\d,]+\s+applicants?|Be among the first 25 applicants)\b",all_text,re.I)
 if applicant:j["num_applicants"]=applicant.group(1)
 badge=re.search(r"\b(Actively Hiring|Be an early applicant)\b",all_text,re.I)
 if badge:
  j["hiring_badge"]=badge.group(1)
  j["is_actively_hiring"]=badge.group(1).lower()=="actively hiring"
  j["is_early_applicant"]=badge.group(1).lower()=="be an early applicant"
 salary=re.search(r"((?:£|\$|€)[\d,]+(?:\s*[-–]\s*(?:£|\$|€)?[\d,]+)?(?:\s*per\s*(?:year|hour|month))?)",all_text,re.I)
 if salary:j["salary_range"]=salary.group(1)
 email=re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",j.get("job_description") or "",re.I)
 if email:j["contact_email"]=email.group(0)
 j["easy_apply"]=True if re.search(r"\bEasy Apply\b",all_text,re.I) else None
 for n in dom.walk():
  if n.tag=="a" and re.search(r"apply-button|apply-link",n.attrs.get("class",""),re.I):
   j["apply_url"]=safe_url(n.attrs.get("href"));break
 labels={"seniority_level":"Seniority level","employment_type":"Employment type","job_function":"Job function","industries":"Industries"}
 for key,label in labels.items():
  for h in dom.walk():
   if h.tag=="h3" and h.text().strip().lower()==label.lower():
    sibling=False
    for n in dom.walk():
     if n is h:sibling=True;continue
     if sibling and n.tag=="span" and n.text():j[key]=n.text();break
    break
 return j

def run_job(filters, progress):
 titles=filters.get("jobs_titles") or [""]
 cities=filters.get("cities") or [filters.get("location") or ""]
 titles=titles[:3];cities=cities[:3]
 limit=max(10,min(20,int(filters.get("jobs_entries") or 10)))
 posted={"Past 24 hours":"86400","Past Week":"604800","Past Month":"2592000"}.get(filters.get("posted_within"))
 found={};pages=0;stop_reason=None;failures=[]
 for title in titles:
  for city in cities:
   for start in range(0,100,10):
    if len(found)>=limit:break
    params={"keywords":title,"location":city,"start":str(start)}
    if posted:params["f_TPR"]=posted
    try:
     print("collector search page start","offset",start,flush=True)
     cards=parse_cards(request_text(SEARCH+"?"+urlencode(params)),title);pages+=1
     print("collector search page parsed","offset",start,"cards",len(cards),flush=True)
    except Exception as e:
     stop_reason=str(e)[:160];break
    if not cards:break
    new=0
    for card in cards:
     if card["job_id"] in found:continue
     if len(found)>=limit:break
     new+=1
     try:
      time.sleep(0.8)
      print("collector detail start",card["job_id"],flush=True)
      detail=request_text(DETAIL+card["job_id"])
      item=parse_detail(detail,card)
      print("collector detail parsed",card["job_id"],"description_chars",len(item.get("job_description") or ""),flush=True)
      found[card["job_id"]]=item
     except Exception as e:
      if "SOURCE_ACCESS_RESTRICTED" in str(e):
       stop_reason=str(e)[:160];break
      failures.append({"job_id":card["job_id"],"reason":str(e)[:160]})
      found[card["job_id"]]=card
     print("collector progress save","returned",len(found),flush=True)
     progress({"items":list(found.values()),"returned":len(found),"completed":len(found),"pages_fetched":pages,"detail_failures":failures,"complete":False,"stop_reason":stop_reason})
    if stop_reason or not new:break
   if stop_reason or len(found)>=limit:break
  if stop_reason or len(found)>=limit:break
 if stop_reason is None and len(found)<limit: stop_reason="SOURCE_EXHAUSTED"
 result={"items":list(found.values()),"returned":len(found),"completed":len(found),"pages_fetched":pages,"detail_failures":failures,"complete":stop_reason in (None,"SOURCE_EXHAUSTED"),"stop_reason":stop_reason,"field_names":FIELD_NAMES,"source":"vorlen_owned_public_linkedin","apify_dependency":False}
 progress(result)
 return result
