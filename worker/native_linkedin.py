"""Bounded native LinkedIn read adapters. Private interfaces require live verification.

Endpoint references: tomquirk/linkedin-api linkedin_api/linkedin.py. No retries,
challenge bypass, external proxy purchase or arbitrary URL requests.
"""
from urllib.parse import quote
import json

# Projection applies recursively; response cookies, tokens and tracking blobs never leave worker.
FIELDS = set('entityUrn objectUrn publicIdentifier firstName lastName name headline occupation summary industryName locationName geoLocationName address emailAddress phoneNumbers websites url category number type companyName title description degreeName fieldOfStudy timePeriod startDate endDate year month day schoolName school company miniCompany miniProfile profile positionView educationView skillView languageView certificationView volunteerExperienceView publicationView projectView honorView elements skills languages certifications experience education publications volunteer honors projects text body message attributedBody value createdAt lastActivityAt read unreadCount participants eventContent eventCreate content actor author commentary updateMetadata socialDetail totalSocialActivityCounts numLikes numComments numShares commentCount reactionCount navigationUrl primarySubtitle secondarySubtitle trackingUrn distance memberDistance connectionCount following followingInfo followingCount followersCount invitationType sentTime invitation relationshipStatus distance companyIndustries employeeCountRange employeeCount staffCount websiteUrl universalName foundedOn headquarters locations tagline companyPageUrl confirmedEmailAddress birthDateOn twitterHandles'.split())

def project(value, depth=0):
    if depth > 10:
        return None
    if isinstance(value, dict):
        return {k: project(v, depth+1) for k, v in value.items() if k in FIELDS or k.startswith('com.linkedin.')}
    if isinstance(value, list):
        return [project(v, depth+1) for v in value[:100]]
    if isinstance(value, str):
        return value[:12000]
    if value is None or isinstance(value, (int, float, bool)):
        return value
    return None

def dereference(data):
    included = {v.get('entityUrn'): v for v in data.get('included', []) if isinstance(v, dict) and v.get('entityUrn')}
    def walk(v, seen=()):
        if len(seen)>6: return None
        if isinstance(v, list): return [walk(x,seen) for x in v[:100]]
        if not isinstance(v, dict): return v
        out={}
        for k,x in v.items():
            if k.startswith('*'):
                def resolve(urn):
                    return walk(included[urn],seen+(urn,)) if isinstance(urn,str) and urn in included and urn not in seen else urn
                out[k[1:]]=[resolve(u) for u in x[:100]] if isinstance(x,list) else resolve(x)
            elif k!='included':out[k]=walk(x,seen)
        return out
    return walk(data.get('data',data))

def collection(data, count, error):
    root=dereference(data)
    if not isinstance(root,dict) or not isinstance(root.get('elements'),list):raise error('PROVIDER_SCHEMA_CHANGED')
    items=[project(row) for row in root['elements'][:count]]
    while len(json.dumps(items).encode())>160000:items.pop()
    paging=root.get('paging') or {}
    safe={k:v for k,v in paging.items() if k in ('start','count','total') and isinstance(v,int)}
    next_offset=None
    if 'start' in safe and items and len(root['elements'])>=count:
        n=safe['start']+len(items)
        if 'total' not in safe or n<safe['total']:next_offset=n
    return {'items':items,'paging':safe,'next_offset':next_offset,'truncated':len(items)<len(root['elements']), 'live_verified':False}

def full_profile(data, error):
    root=dereference(data)
    p=root.get('profile') if isinstance(root,dict) else None
    if not isinstance(p,dict):raise error('PROVIDER_SCHEMA_CHANGED')
    result=project(p)
    for output, key in {'experience':'positionView','education':'educationView','skills':'skillView','languages':'languageView','certifications':'certificationView','volunteer':'volunteerExperienceView','publications':'publicationView','projects':'projectView','honors':'honorView'}.items():
        if isinstance(root.get(key),dict):result[output]=project(root[key].get('elements',[]))
    if len(json.dumps(result).encode())>160000:raise error('RESPONSE_TOO_LARGE')
    return result

def search(browser,op,p,error):
    # Encode every value before embedding in Rest.li syntax. Never concatenate raw keywords.
    esc=lambda v:quote(str(v),safe='')
    pairs=[('resultType','PEOPLE' if op=='search_people' else 'COMPANIES')]
    mapping={'location':'geoUrn','current_company':'currentCompany','industry':'industry','school':'schools','network':'network','first_name':'firstName','last_name':'lastName','title':'title','sector':'industry','company_size':'companySize'}
    pairs.extend((target,p[key]) for key,target in mapping.items() if key in p)
    filters='List('+','.join('(key:'+key+',value:List('+esc(value)+'))' for key,value in pairs)+')'
    query='(start:'+str(p.get('start',0))+',origin:GLOBAL_SEARCH_HEADER,query:('
    if p.get('keywords'):query+='keywords:'+esc(p['keywords'])+','
    query+='flagshipSearchIntent:SEARCH_SRP,queryParameters:'+filters+',includeFiltersInResponse:false))'
    data=browser.request('/graphql',{'variables':query,'queryId':'voyagerSearchDashClusters.b0928897b71bd00a5a7291755dcd64f0'})[0]
    root=dereference(data)
    clusters=root.get('searchDashClustersByAll')
    if not isinstance(clusters,dict) or not isinstance(clusters.get('elements'),list):raise error('PROVIDER_SCHEMA_CHANGED')
    rows=[]
    for cluster in clusters['elements']:
        for item in cluster.get('items',[]):
            entity=(item.get('item') or {}).get('entityResult')
            if isinstance(entity,dict):rows.append(entity)
    return collection({'elements':rows,'paging':clusters.get('paging',{'start':p.get('start',0)})},p.get('count',10),error)

def read(browser,op,p,error):
    paging={'start':p.get('start',0),'count':p.get('count',10)}
    ident=quote(p.get('identifier',''),safe='')
    if op=='profile' and ident:return full_profile(browser.request('/identity/profiles/'+ident+'/profileView')[0],error)
    if op=='contact':
        root=dereference(browser.request('/identity/profiles/'+ident+'/profileContactInfo')[0])
        if not any(k in root for k in ('emailAddress','phoneNumbers','websites','entityUrn')):raise error('PROVIDER_SCHEMA_CHANGED')
        return project(root)
    if op=='company':
        return collection(browser.request('/organization/companies',{'q':'universalName','universalName':p['identifier'],'decorationId':'com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12'})[0],1,error)
    if op in ('search_people','search_companies'):return search(browser,op,p,error)
    if op=='network_status':
        root=dereference(browser.request('/identity/profiles/'+ident+'/networkinfo')[0])
        # Unknown is not "not connected". No inference from absent invitation rows.
        allowed={k:project(root[k]) for k in ('distance','relationshipStatus','invitation','followingInfo','connectionCount') if k in root}
        if not allowed:raise error('PROVIDER_SCHEMA_CHANGED')
        return {'relationship':allowed,'invitation_status_verified':'relationshipStatus' in allowed or 'invitation' in allowed}
    if op=='sent_invitations':data=browser.request('/relationships/invitationViews',{'q':'sentInvitation',**paging})[0]
    elif op=='feed':data=browser.request('/feed/updatesV2',{'q':'chronFeed',**paging})[0]
    elif op=='post_comments':data=browser.request('/feed/comments',{'q':'comments','updateId':'activity:'+p['post_id'],'sortOrder':'RELEVANCE',**paging})[0]
    else:raise error('UNSUPPORTED_OPERATION')
    return collection(data,paging['count'],error)

def find_conversation(browser,identifier,error):
    root=browser.request('/identity/profiles/'+quote(identifier,safe='')+'/profileView')[0]
    # Profile URN identifies a member; never use an arbitrary caller-supplied request path.
    p=root.get('profile',{})
    urn=(p.get('miniProfile') or {}).get('entityUrn') or p.get('entityUrn')
    if not isinstance(urn,str) or not urn.startswith('urn:li:fs_'):raise error('PROVIDER_SCHEMA_CHANGED')
    member=urn.split(':')[-1]
    data=browser.request('/messaging/conversations',{'keyVersion':'LEGACY_INBOX','q':'participants','recipients':'List('+member+')'})[0]
    rows=data.get('elements')
    if not isinstance(rows,list):raise error('PROVIDER_SCHEMA_CHANGED')
    if len(rows)>1:raise error('AMBIGUOUS_CONVERSATION')
    cid=rows[0].get('entityUrn','').split(':')[-1] if rows else None
    if rows and not cid:raise error('PROVIDER_SCHEMA_CHANGED')
    return member,cid
