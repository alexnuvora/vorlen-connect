"""Read-only OCI cost/footprint audit. Never create, resize, stop or delete resources."""
import configparser
from datetime import datetime,timezone
import json
import os
import sys
import oci
TENANCY='ocid1.tenancy.oc1..aaaaaaaaclnmrik5hypi734mzstra5mi752uy5ljxzihburzc3athnmpxw2a'
INSTANCE='ocid1.instance.oc1.uk-london-1.anwgiljtdycw3nacke4vonqaqm7nt3pca47x4fzlhozzeeqnypzrogqudg7a'
REGION='uk-london-1'
issues=[]
def emit(section,data):print(json.dumps({'section':section,'data':data},default=str),flush=True)
def attempt(section,fn):
 try:return fn()
 except Exception as e:
  issues.append(section+' could not be verified')
  emit(section,{'unverified':True,'error_type':type(e).__name__,'status':getattr(e,'status',None),'code':getattr(e,'code',None)})
  return None
def all_items(fn,*args,**kwargs):return oci.pagination.list_call_get_all_results(fn,*args,**kwargs).data
def main():
 parser=configparser.ConfigParser(interpolation=None);parser.read_string(os.environ.pop('VORLEN_OCI_CONFIG',''))
 cfg={k:parser['DEFAULT'][k] for k in ('user','tenancy','fingerprint','region')}
 if cfg['tenancy']!=TENANCY or cfg['region']!=REGION:raise ValueError('Incorrect OCI target')
 cfg['key_content']=os.environ.pop('VORLEN_OCI_API_PRIVATE_KEY')
 identity=oci.identity.IdentityClient(cfg,timeout=(10,25))
 regions=all_items(identity.list_region_subscriptions,TENANCY)
 home=next(r.region_name for r in regions if r.is_home_region)
 emit('home_region',{'home':home,'worker_region':REGION,'matches':home==REGION})
 if home!=REGION:issues.append('Worker is outside the home region')
 compute=oci.core.ComputeClient(cfg,timeout=(10,25));volume=oci.core.BlockstorageClient(cfg,timeout=(10,25))
 instance=compute.get_instance(INSTANCE).data
 emit('target_instance',{'shape':instance.shape,'state':instance.lifecycle_state,'memory_gb':instance.shape_config.memory_in_gbs})
 if instance.shape!='VM.Standard.E2.1.Micro':issues.append('Worker is not the approved free Micro shape')
 compartments=all_items(identity.list_compartments,TENANCY,compartment_id_in_subtree=True,access_level='ACCESSIBLE')
 ids=[TENANCY]+[c.id for c in compartments if c.lifecycle_state=='ACTIVE']
 ads=all_items(identity.list_availability_domains,TENANCY)
 instances=[];volumes=[];backups=[]
 for cid in ids:
  result=attempt('instances',lambda:all_items(compute.list_instances,cid))
  instances.extend(result or [])
  result=attempt('block_volumes',lambda:all_items(volume.list_volumes,compartment_id=cid))
  volumes.extend(result or [])
  result=attempt('volume_backups',lambda:all_items(volume.list_volume_backups,cid))
  backups.extend(result or [])
  result=attempt('boot_backups',lambda:all_items(volume.list_boot_volume_backups,cid))
  backups.extend(result or [])
  for ad in ads:
   result=attempt('boot_volumes',lambda:all_items(volume.list_boot_volumes,availability_domain=ad.name,compartment_id=cid))
   volumes.extend(result or [])
 live=[i for i in instances if i.lifecycle_state not in ('TERMINATED','TERMINATING')]
 active_volumes=[v for v in volumes if v.lifecycle_state not in ('TERMINATED','TERMINATING')]
 active_backups=[b for b in backups if b.lifecycle_state!='TERMINATED']
 total_gb=sum(v.size_in_gbs or 0 for v in active_volumes)
 micro=sum(i.shape=='VM.Standard.E2.1.Micro' for i in live)
 emit('home_region_footprint',{'micro_instances':micro,'other_instances':len(live)-micro,'boot_and_block_gb':total_gb,'volume_count':len(active_volumes),'backups':len(active_backups),'volume_vpus':[getattr(v,'vpus_per_gb',None) for v in active_volumes]})
 if micro>2:issues.append('More than two Micro instances')
 if total_gb>200:issues.append('Combined boot/block storage exceeds 200 GB')
 if len(active_backups)>5:issues.append('More than five boot/block backups')
 if any((getattr(v,'vpus_per_gb',0) or 0)>10 for v in active_volumes):issues.append('Storage performance exceeds balanced 10 VPU/GB')
 # Cost data covers the tenancy; aggregation omits resource IDs and customer data.
 def costs():
  cost_cfg={**cfg,'region':home};client=oci.usage_api.UsageapiClient(cost_cfg,timeout=(10,40))
  end=datetime.now(timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
  details=oci.usage_api.models.RequestSummarizedUsagesDetails(tenant_id=TENANCY,time_usage_started=end.replace(day=1,hour=0),time_usage_ended=end,granularity='DAILY',query_type='COST',group_by=['service'],is_aggregate_by_time=True)
  rows=all_items(client.request_summarized_usages,details)
  if hasattr(rows,'items') and not isinstance(rows,list):rows=rows.items
  emit('reported_month_to_date_cost',{'through_utc':end.isoformat(),'rows':[{'service':r.service,'amount':r.computed_amount,'currency':r.currency} for r in rows],'note':'Reported data may lag; this is not a real-time spending cap.'})
  if any((r.computed_amount or 0)>0 for r in rows):issues.append('Positive reported cost requires billing review')
 attempt('billing_access',costs)
 def payment_status():
  client=oci.osp_gateway.SubscriptionServiceClient({**cfg,'region':home},timeout=(10,25))
  result=all_items(client.list_subscriptions,home,TENANCY,retry_strategy=oci.retry.NoneRetryStrategy())
  rows=result.items if hasattr(result,'items') and not isinstance(result,list) else result
  emit('account_payment_status',{'subscriptions':[{'plan_type':r.plan_type,'upgrade_state':r.upgrade_state,'is_intent_to_pay':r.is_intent_to_pay,'time_plan_upgrade':r.time_plan_upgrade} for r in rows]})
  if not rows:issues.append('Account payment status could not be verified')
  if any(r.plan_type!='FREE_TIER' for r in rows):issues.append('Account is not exclusively Free Tier; zero billing is not guaranteed')
 attempt('account_payment_status',payment_status)
 emit('audit_summary',{'issues':issues,'resource_changes':False,'zero_bill_guaranteed':False})
 if issues:sys.exit(2)
if __name__=='__main__':
 try:main()
 except Exception as e:
  emit('audit_failed',{'error_type':type(e).__name__,'status':getattr(e,'status',None),'code':getattr(e,'code',None)})
  sys.exit(1)
