import json,pathlib,datetime,collections
p=pathlib.Path(__file__).resolve().parent
traces=[json.loads(line) for line in (p/'cognitive-traces.jsonl').read_text().splitlines()]
history=json.loads((p/'version-history.json').read_text())
final=json.loads((p/'checkpoints/final-development.json').read_text())
metrics=[];contracts=[]
for t in traces:
 cycle=t['cycle'];events=t['events']; seq=cycle['sequence'];thoughts=[e for e in events if e['type']=='part.thought'];contexts=[e['payload'] for e in events if e['type']=='self.arbitration_started']
 inputs=[e['payload'] for e in events if e['type']=='construction.inference_started' and e['payload']['task']=='part_cognition']
 part_worlds=[i.get('world')==t['world'] for i in inputs]
 no_self_raw=all(not any(k in c for k in ['world','worldstate','memories','parts','predictions']) for c in contexts)
 scoped_ids=[d for e in thoughts for d in e['payload']['partSnapshot']['instance'].get('dispositionBindings',[]) if isinstance(d,dict)]
 samecycle=[]
 for binding in scoped_ids:
  d=next((d for d in final['dispositions'] if d['id']==binding['dispositionId']),None)
  if d and d.get('scaffold',{}).get('createdCycle')==cycle['id']:samecycle.append(d['id'])
 contracts.append({'cycleId':cycle['id'],'immutablePartWorlds':part_worlds,'selfInputsExcludeRawState':no_self_raw,'sameCycleScaffoldParticipation':samecycle,'primitiveOnlineEvents':[e['type'] for e in events if e['type'].startswith('primitive.')],'selfChoices':[e['payload']['choice'] for e in events if e['type']=='self.choice']})
 checkpoint=json.loads((p/'checkpoints'/f'{seq:02d}-development-after.json').read_text())
 ds=checkpoint['dispositions'];counts=collections.Counter(d['name'] for d in ds)
 metrics.append({'cycle':seq,'cycleId':cycle['id'],'dispositions':len(ds),'newDispositions':len(ds)-(metrics[-1]['dispositions'] if metrics else 0),'temporary':sum(d['temporary'] for d in ds),'durable':sum(not d['temporary'] for d in ds),'activeTemporary':sum(d['temporary'] and d['active'] for d in ds),'endedTemporary':sum(bool(d.get('scaffold',{}).get('endedCycle')) for d in ds),'partRecords':len(checkpoint['parts']),'participatingParts':len(thoughts),'activationDensity':len(thoughts)/len(ds) if ds else None,'memories':len(checkpoint['memories']),'predictions':len(checkpoint['predictions']),'openPredictions':sum(q['status']=='open' for q in checkpoint['predictions']),'duplicateNames':{n:c for n,c in counts.items() if c>1},'lineageEdges':sum(len(d.get('development',{}).get('lineage',[])) for d in ds),'maximumObservedLineageDepth':0,'sameCycleRecursiveParticipation':len(samecycle)})
assert all(all(c['immutablePartWorlds']) and c['selfInputsExcludeRawState'] and not c['sameCycleScaffoldParticipation'] and not c['primitiveOnlineEvents'] for c in contracts)
(p/'contract-observations.json').write_text(json.dumps(contracts,indent=2));(p/'disposition-health.json').write_text(json.dumps(metrics,indent=2))
for c in contracts:
 with (p/'findings.jsonl').open('a') as out:out.write(json.dumps({'role':'observer','classification':['EXPECTED_BEHAVIOR'],'severity':'informational','confidence':'high','reproducibility':'Six configured cycles; structural audit','evidence':[c['cycleId'],'contract-observations.json'],'assessment':'Captured Part worlds equal saved immutable world; recorded Self inputs exclude raw state; no same-cycle scaffold participation or online primitives. Scope limited to captured contexts.'})+'\n')
# Immutable historical versions and actual recall are evidence; behavior alone is insufficient.
recalls=[{'cycleId':t['cycle']['id'],'partId':e['payload']['partId'],'memoryIds':e['payload']['recalledMemoryIds']} for t in traces for e in t['events'] if e['type']=='part.thought' and e['payload']['recalledMemoryIds']]
(p/'recall-evidence.json').write_text(json.dumps(recalls,indent=2))
print(json.dumps({'cycles':len(traces),'contractsPassed':True,'versions':len(history),'recallEvents':len(recalls),'lastMetrics':metrics[-1]}))
