"""Public-web candidate discovery and Open to Work verification.

Uses Bing's public RSS search endpoint (no LinkedIn account, cookies or API key).
LinkedIn pages are fetched only as ordinary public pages; access restrictions are
respected. A candidate is returned as verified only after image-level badge
verification. CV availability is independent.
"""
from __future__ import annotations
from html.parser import HTMLParser
from urllib.parse import urlencode, urlparse
from urllib.request import Request, build_opener, HTTPSHandler, BaseHandler
from urllib.error import HTTPError, URLError
from ipaddress import ip_address
from xml.etree import ElementTree as ET
import re, time

from open_to_work import inspect_avatar, fetch_public_avatar

BING_RSS = "https://www.bing.com/search"
MAX_RESULTS = 30
MAX_CV_RESULTS = 3

class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = False
        self.title_text = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key in ("og:image", "og:title", "twitter:image", "description"):
                self.meta[key] = a.get("content", "")
        elif tag == "title":
            self.title = True
    def handle_endtag(self, tag):
        if tag == "title": self.title = False
    def handle_data(self, data):
        if self.title: self.title_text.append(data)

class SearchResultParser:
    pass

def _get(url, accept, limit=1200000, timeout=10):
    req = Request(url, headers={"User-Agent":"Mozilla/5.0 (compatible; VorlenConnectPublicResearch/1.0; +https://vorlen.co.uk)",
                               "Accept":accept, "Accept-Language":"en-GB,en;q=0.8"})
    class NoRedirect(BaseHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError("PUBLIC_SOURCE_REDIRECT_REJECTED")
    opener = build_opener(NoRedirect, HTTPSHandler())
    try:
        with opener.open(req, timeout=timeout) as response:
            if response.status != 200: raise RuntimeError("PUBLIC_SOURCE_HTTP_"+str(response.status))
            data=response.read(limit+1)
            if len(data)>limit: raise RuntimeError("PUBLIC_SOURCE_TOO_LARGE")
            return data
    except HTTPError as e:
        if e.code in (401,403,429): raise RuntimeError("PUBLIC_SOURCE_RESTRICTED_HTTP_"+str(e.code))
        raise RuntimeError("PUBLIC_SOURCE_HTTP_"+str(e.code))
    except URLError as e: raise RuntimeError("PUBLIC_SOURCE_NETWORK_"+type(e.reason).__name__)

def search_web(query, count=10):
    url=BING_RSS+"?"+urlencode({"format":"rss","q":query,"setlang":"en-GB"})
    raw=_get(url,"application/rss+xml,application/xml,text/xml")
    try: root=ET.fromstring(raw)
    except ET.ParseError: raise RuntimeError("SEARCH_RESULTS_UNREADABLE")
    out=[]
    for item in root.findall(".//item")[:min(MAX_RESULTS,count)]:
        title=(item.findtext("title") or "").strip()
        link=(item.findtext("link") or "").strip()
        desc=(item.findtext("description") or "").strip()
        if title and link and urlparse(link).scheme=="https":
            out.append({"title":title[:300],"url":link[:2000],"snippet":re.sub(r"<[^>]+>"," ",desc)[:1000]})
    return out

def linkedin_url(url):
    try:
        u=urlparse(url)
        return u.scheme=="https" and (u.hostname or "").lower() in ("linkedin.com","www.linkedin.com") and u.path.startswith("/in/")
    except Exception:return False

def profile_metadata(url):
    if not linkedin_url(url): return {"status":"unavailable","reason":"NOT_A_PUBLIC_LINKEDIN_PROFILE"}
    try:
        raw=_get(url,"text/html,application/xhtml+xml",limit=1500000)
        parser=MetaParser();parser.feed(raw.decode("utf-8","replace"))
        avatar=parser.meta.get("og:image") or parser.meta.get("twitter:image")
        title=parser.meta.get("og:title") or "".join(parser.title_text)
        return {"status":"available","avatar_url":avatar,"page_title":title[:500]}
    except Exception as e:
        return {"status":"unavailable","reason":str(e)[:120]}

def candidate_name(title):
    # Search engines commonly title LinkedIn results as "Name - role - LinkedIn".
    value=re.split(r"\s[-|–]\s",title,1)[0].strip()
    value=re.sub(r"\s*\|\s*LinkedIn.*$","",value,flags=re.I).strip()
    return value[:160] if 1<len(value.split())<=6 else None

def verify_public_cv(url):
    try:
        u=urlparse(url)
        host=(u.hostname or "").lower()
        if u.scheme!="https" or not host or host.endswith((".local",".internal",".localhost")):
            return False
        try:
            ip=ip_address(host)
            if not ip.is_global:return False
        except ValueError:
            if "." not in host:return False
        req=Request(url,method="HEAD",headers={"User-Agent":"VorlenConnectPublicResearch/1.0","Accept":"application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"})
        class NoRedirect(BaseHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                raise ValueError("CV_REDIRECT_REJECTED")
        with build_opener(NoRedirect,HTTPSHandler()).open(req,timeout=8) as response:
            if response.status!=200:return False
            mime=(response.headers.get("Content-Type") or "").split(";")[0].lower()
            disposition=(response.headers.get("Content-Disposition") or "").lower()
            path=(u.path or "").lower()
            return mime in ("application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document") or path.endswith((".pdf",".doc",".docx")) or any(x in disposition for x in (".pdf",".docx",".doc"))
    except Exception:
        return False

def run_candidate_search(filters, progress):
    role=str(filters.get("role") or filters.get("keywords") or "").strip()[:120]
    location=str(filters.get("location") or "").strip()[:120]
    if not role: raise ValueError("ROLE_REQUIRED")
    if not location: raise ValueError("LOCATION_REQUIRED")
    limit=max(1,min(MAX_RESULTS,int(filters.get("limit") or 10)))
    query=f'site:linkedin.com/in "{role}" "{location}" ("open to work" OR "#opentowork")'
    links=search_web(query,limit*2)
    candidates=[];seen=set();failures=[];scanned=0;unverified=0
    for hit in links:
        url=hit["url"].split("?")[0].rstrip("/")
        if not linkedin_url(url) or url.lower() in seen: continue
        seen.add(url)
        name=candidate_name(hit["title"])
        if not name: continue
        meta=profile_metadata(url)
        badge={"is_open_to_work":False,"status":"unverified","confidence":0.0,"reason":"AVATAR_UNAVAILABLE"}
        if meta.get("avatar_url"):
            try:
                image=fetch_public_avatar(meta["avatar_url"])
                badge=inspect_avatar(image)
            except Exception as e:
                badge={"is_open_to_work":False,"status":"unverified","confidence":0.0,"reason":str(e)[:120]}
        scanned+=1
        if badge.get('is_open_to_work') is not True:
            unverified+=1
            progress({"items":candidates,"returned":len(candidates),"verified":len(candidates),"scanned":scanned,"unverified":unverified,"cv_available":sum(1 for x in candidates if x["cv_status"]=="available"),"failures":failures,"complete":False})
            continue
        # CV discovery is supplementary and is performed only for verified candidates.
        cv=[]
        try:
            cv=search_web(f'"{name}" "{role}" (CV OR resume) filetype:pdf',MAX_CV_RESULTS)
        except Exception as e:
            failures.append({"stage":"cv_search","candidate":name,"reason":str(e)[:120]})
        cv_links=[]
        for hit_cv in cv:
            if verify_public_cv(hit_cv["url"]):
                cv_links.append(hit_cv["url"])
            if len(cv_links)>=MAX_CV_RESULTS:break
        row={
            "name":name,"role":role,"location":location,"linkedin_url":url,
            "profile_source":"Bing public web index","profile_title":meta.get("page_title") or hit["title"],
            "badge":badge,"open_to_work_verified":badge.get("is_open_to_work") is True,
            "cv_status":"available" if cv_links else "not_found",
            "cv_links":cv_links,"cv_required":False,
        }
        candidates.append(row)
        progress({"items":candidates,"returned":len(candidates),
                  "verified":len(candidates),"scanned":scanned,"unverified":unverified,
                  "cv_available":sum(1 for x in candidates if x["cv_status"]=="available"),
                  "failures":failures,"complete":False})
        time.sleep(.25)
        if len(candidates)>=limit: break
    result={"items":candidates,"returned":len(candidates),
            "verified":len(candidates),"scanned":scanned,"unverified":unverified,
            "cv_available":sum(1 for x in candidates if x["cv_status"]=="available"),
            "failures":failures,"complete":True,
            "source":"public_web_search_no_linkedin_login",
            "verification_rule":"green profile-photo frame AND Open to Work OCR text",
            "unverified_excluded_from_verified":True,"candidate_filter":"only image-verified Open to Work profiles are returned"}
    progress(result)
    return result
