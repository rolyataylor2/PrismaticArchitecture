import json,urllib.request,datetime,pathlib,sys,time
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/'run-manifest.json').read_text())
branch,scenario,text=sys.argv[1:4]
agent=manifest['developmentalAgentId' if branch=='development' else 'comparisonAgentId']
thread=sys.argv[4] if len(sys.argv)>4 else 'gauntlet-longitudinal'
base='http://127.0.0.1:3011'
def api(path,body=None):
 request=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=180) as response:return json.load(response)
def append(name,data):
 with (root/name).open('a') as out: out.write(json.dumps(data)+'\n')
iteration=sum(1 for line in (root/'conversations.jsonl').open() if json.loads(line)['role']=='participant_input')+1 if (root/'conversations.jsonl').exists() else 1
if iteration>manifest['limits']['interactions']:raise SystemExit('interaction limit reached')
pre=api('/api/agents/'+agent); preevents=api('/api/agents/'+agent+'/events')
elapsed=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(manifest['createdAt'].replace('Z','+00:00'))).total_seconds()
usage=[e['payload'] for e in preevents if e['type']=='provider.usage']
tokens=sum(u.get('inputTokens',0)+u.get('outputTokens',0) for u in usage)
if elapsed>manifest['limits']['wallClockMinutes']*60 or len(pre['dispositions'])>=manifest['limits']['structuralPopulationStop'] or tokens>=manifest['limits']['measuredGenerativeTokens']:raise SystemExit('Experimental resource stop: triggering state remains in store and previous checkpoints')
if text=='__CONSOLIDATE__' and len(pre['consolidations'])>=manifest['limits']['consolidationPasses']:raise SystemExit('Consolidation pass limit reached')
checkpoint=f'{iteration:02d}-{branch}-before.json'
(root/'checkpoints'/checkpoint).write_text(json.dumps(pre,indent=2))
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
append('conversations.jsonl',{'iteration':iteration,'timestamp':start,'role':'participant_input','scenario_id':scenario,'agentId':agent,'threadId':thread,'text':text,'simulated':True})
try: response=api('/api/agents/'+agent+'/consolidate',{}) if text=='__CONSOLIDATE__' else api('/api/agents/'+agent+'/message',{'text':text,'source':'simulated participant','threadId':thread})
except Exception as error:response={'error':str(error)}
post=api('/api/agents/'+agent); after=f'{iteration:02d}-{branch}-after.json'
(root/'checkpoints'/after).write_text(json.dumps(post,indent=2))
newcycles=[c for c in post['cycles'] if c['id'] not in {c['id'] for c in pre['cycles']}]
traces=[api('/api/cycles/'+c['id']) for c in newcycles]
for trace in traces: append('cognitive-traces.jsonl',trace)
if text=='__CONSOLIDATE__': append('consolidation-traces.jsonl',{'iteration':iteration,'result':response,'events':[e for e in api('/api/agents/'+agent+'/events') if e['sequence']>(preevents[-1]['sequence'] if preevents else 0)]})
outputs=[x for x in post['executions'] if x['id'] not in {e['id'] for e in pre['executions']}]
append('conversations.jsonl',{'iteration':iteration,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'agent_execution','scenario_id':scenario,'agentId':agent,'executions':outputs})
changes={key:[x for x in post[key] if not any(y['id']==x['id'] and y['version']==x['version'] for y in pre[key])] for key in ['parts','memories','predictions','dispositions']}
record={'run_id':manifest['run_id'],'iteration':iteration,'timestamp':start,'scenario_id':scenario,'hypothesis':scenario,'roles':{'participant':'Authored external experience only','observer':'Read-only API snapshot and trace capture','researcher':'Assessment recorded separately','engineer':'No mutation'},'theory_references':['ADR 0133','ADR 0136','ADR 0138'],'initial_checkpoint':'checkpoints/'+checkpoint,'agent_input':{'text':text,'threadId':thread},'environment_observation':{'simulated':True,'actualPerceivedWorldIds':[t['world']['id'] for t in traces]},'agent_response':outputs,'trace_reference':[c['id'] for c in newcycles],'expected_mechanisms':[],'observed_mechanisms':list(dict.fromkeys(e['type'] for t in traces for e in t['events'])),'prediction_results':changes['predictions'],'memory_changes':changes['memories'],'disposition_changes':changes['dispositions'],'self_decision':[e for t in traces for e in t['events'] if e['type']=='self.choice'],'anomalies':[],'classification':['UNASSESSED'],'assessment':'Pending causal review; generated response alone is not validation.','confidence':'unassessed','repair_reference':None,'retest_reference':None,'final_checkpoint':'checkpoints/'+after}
append('findings.jsonl',record)
for key in ['memories','predictions']: 
 for change in changes[key]:append('learning-events.jsonl',{'iteration':iteration,'kind':key,'record':change})
for change in changes['dispositions']:append('disposition-lineage.jsonl',{'iteration':iteration,'record':change})
print(json.dumps({'iteration':iteration,'cycles':newcycles,'outputs':outputs,'counts':{k:len(post[k]) for k in changes},'changes':{k:len(v) for k,v in changes.items()},'eventTypes':record['observed_mechanisms'],'error':response.get('error')}))
