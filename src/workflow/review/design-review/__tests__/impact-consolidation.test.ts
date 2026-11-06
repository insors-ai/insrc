import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDesignResult, consolidateDesignReview } from '../results.js';
import { designFindingKey } from '../provenance.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { impactFixture } from './impact-fixtures.js';
import type { DesignChunkResult, DesignFindingDecision } from '../contracts.js';

function setup(t:Parameters<typeof impactFixture>[0]){
 const f=impactFixture(t);
 for(const [i,severity]of [[0,'HIGH'],[1,'MED']] as const)f.baseline.completedChunks[i]!.findings=[{id:'same-local-id',severity,location:'/body/summary',message:'Known concern '+i,evidenceReferences:[f.md]}];
 // Initial reviews preserve global finding ID rules; historical tuple collision is exercised in an impact result below.
 f.baseline.completedChunks[1]!.findings[0]!.id='edit-finding';
 f.baseline.status='changes_requested';f.baseline.report=consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.baseline.plan!,f.baseline.completedChunks);
 const keep={attempt:1,chunkId:'keep',findingId:'same-local-id'},edit={attempt:1,chunkId:'edit',findingId:'edit-finding'};
 f.impact.carriedFindingIds=[designFindingKey(keep),designFindingKey(edit)];f.current.plan=f.plan;f.current.impact=f.impact;
 const result=(id:string):DesignChunkResult=>({chunkId:id,status:'passed',summary:'Genuine synthetic inspection fixture',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
 const decisions:DesignFindingDecision[]=[{source:keep,action:'carry',rationale:'Owning concern retained',evidenceReferences:[f.md]},{source:edit,action:'resolved',rationale:'Fresh contract inspection confirms correction',evidenceReferences:[f.md],reviewedInChunkIds:['edit']}];
 const edited=result('edit'),final=result('final');final.findingDecisions=decisions;
 const assess=(value:DesignChunkResult)=>assessDesignResult(value,f.plan.chunks[2]!,[edited],[],{attempt:f.current,history:f.history});
 const report=(results:DesignChunkResult[])=>{f.current.completedChunks=results;return consolidateDesignReview('review-1',2,f.prepared.subject,f.current.baseline.contentIdentity,f.plan,results,{impact:f.impact,attempts:[...f.history,f.current]});};
 return{...f,keep,edit,edited,final,decisions,assess,report,result};
}

test('exact fresh-retained partition counts carried blockers and derives decisions only from the accepted final result',t=>{
 const f=setup(t),final=f.assess(f.final),report=f.report([f.edited,final]);
 assert.equal(report.status,'changes_requested');assert.deepEqual(report.counts,{HIGH:1,MED:0,LOW:0});assert.deepEqual(report.chunks.map(x=>x.chunkId),['edit','final']);assert.equal(report.impact!.coverageOrigins.length,3);assert.equal(report.impact!.coverageOrigins[0]!.kind,'retained');assert.deepEqual(report.impact!.findingDecisions,final.findingDecisions);assert.deepEqual(report.impact!.effectiveFindingOrigins,[f.keep]);
 const forged={impact:f.impact,attempts:[...f.history,f.current],findingDecisions:[]} as Parameters<typeof consolidateDesignReview>[6];
 const same=consolidateDesignReview('review-1',2,f.prepared.subject,f.current.baseline.contentIdentity,f.plan,[f.edited,final],forged);assert.deepEqual(same.impact!.findingDecisions,final.findingDecisions);
 f.edited.findings=[{id:'local',severity:'LOW',location:'/body/summary',message:'Current edit nit',evidenceReferences:[f.md]}];const collision=structuredClone(final);collision.findings=[{...f.edited.findings[0]!,message:'Different final concern'}];assert.equal(f.report([f.edited,f.assess(collision)]).counts.LOW,2);
 const omitted=structuredClone(f.impact);omitted.retainedCoverage=[];assert.throws(()=>consolidateDesignReview('review-1',2,f.prepared.subject,f.current.baseline.contentIdentity,f.plan,[f.edited,final],{impact:omitted,attempts:[...f.history,f.current]}),{code:'invalid_checkpoint'});
 assert.throws(()=>f.report([f.edited]),{code:'incomplete_review'});
 assert.throws(()=>f.report([final,f.edited]),{code:'invalid_checkpoint'});
});

test('missing reconciliation is accepted incomplete with conservative carry and supersession references a real current finding',t=>{
 const f=setup(t),missing=f.result('final'),assessed=f.assess(missing),report=f.report([f.edited,assessed]);
 assert.equal(assessed.status,'incomplete');assert.equal(assessed.limitations.length,2);assert.deepEqual(report.counts,{HIGH:1,MED:1,LOW:0});assert.deepEqual(report.impact!.findingDecisions,[]);assert.equal(report.status,'incomplete');
 f.edited.findings=[{id:'same-local-id',severity:'LOW',location:'/body/summary',message:'Replacement current finding',evidenceReferences:[f.md]}];
 const superseded=f.result('final');superseded.findingDecisions=[f.decisions[0]!,{...f.decisions[1]!,action:'superseded',reviewedInChunkIds:['edit'],supersededBy:{chunkId:'edit',findingId:'same-local-id'}}];
 const replaced=f.report([f.edited,f.assess(superseded)]);assert.deepEqual(replaced.counts,{HIGH:1,MED:0,LOW:1});assert.equal(replaced.impact!.effectiveFindingOrigins.length,2);
 assert.throws(()=>f.assess({...superseded,findingDecisions:[{...superseded.findingDecisions![1]!,action:'superseded',reviewedInChunkIds:['edit'],supersededBy:{chunkId:'edit',findingId:'invented'}}]}),/current replacement/);
});

test('invalid dispositions cannot close retained-only concerns or cite unknown duplicate or uninspected sources',t=>{
 const f=setup(t);
 for(const decisions of [
  [{...f.decisions[1]!,source:{...f.edit,findingId:'unknown'}}],
  [f.decisions[0]!,f.decisions[0]!],
  [{...f.decisions[1]!,source:f.keep}],
  [{...f.decisions[1]!,action:'resolved' as const,reviewedInChunkIds:['keep']}]
 ])assert.throws(()=>f.assess({...f.final,findingDecisions:decisions}));
 assert.throws(()=>assessDesignResult({...f.edited,findingDecisions:[]},f.plan.chunks[1]!,[],[],{attempt:f.current,history:f.history}),{code:'invalid_schema'});
 assert.throws(()=>assessDesignResult(f.final,f.plan.chunks[2]!,[f.edited]),{code:'invalid_schema'});
 f.edited.status='incomplete';f.edited.limitations=['Required inspection unavailable'];assert.throws(()=>f.assess(f.final),/fresh inspection/);
});

test('checkpoint report projection is derived and cannot be persisted with invented counts or origins',async t=>{
 const f=setup(t);f.current.completedChunks=[f.edited,f.assess(f.final)];f.current.report=f.report(f.current.completedChunks);f.current.status=f.current.report.status;
 f.checkpoint.attempts=[f.baseline,f.current];await saveDesignCheckpoint(f.repo,f.checkpoint);
 assert.deepEqual((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[1]!.report,f.current.report);
 const wrong=structuredClone(f.checkpoint);wrong.attempts[1]!.report!.counts.HIGH=0;await assert.rejects(saveDesignCheckpoint(f.repo,wrong),/does not match accepted state/);
});

test('stored impact reports enforce the same document and checkpoint references as live acceptance',async t=>{
 for(const [chunkId,reference] of [['edit','document'],['final','document'],['final','checkpoint']] as const){
  const f=setup(t),results=[f.edited,f.assess(f.final)],report=f.report(results);
  const missing=reference==='document'?f.md:f.path;
  results.find(r=>r.chunkId===chunkId)!.inspectedReferences=results.find(r=>r.chunkId===chunkId)!.inspectedReferences.filter(r=>r!==missing);
  assert.throws(()=>f.report(results),{code:'invalid_checkpoint'});
  f.current.completedChunks=results;f.current.report={...report,chunks:structuredClone(results)};f.current.status=report.status;f.checkpoint.attempts=[f.baseline,f.current];
  await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint),{code:'invalid_checkpoint'});
 }
 const f=setup(t),limited=structuredClone(f.final);limited.inspectedReferences=limited.inspectedReferences.filter(r=>r!==f.path);limited.limitations=['Required checkpoint inspection unavailable: '+f.path];limited.status='incomplete';
 assert.equal(f.report([f.edited,f.assess(limited)]).status,'incomplete');
});

test('partial reconciliation with final self-inspection is idempotent and preserves omitted blockers',t=>{
 const f=setup(t),value=f.result('final');
 value.findingDecisions=[{...f.decisions[1]!,action:'resolved',reviewedInChunkIds:['final']}];
 const accepted=f.assess(value);
 assert.equal(accepted.status,'incomplete');assert.equal(accepted.limitations.length,1);
 assert.deepEqual(f.assess(accepted),accepted);
 const report=f.report([f.edited,accepted]);assert.equal(report.status,'incomplete');assert.equal(report.counts.HIGH,1);assert.equal(report.counts.MED,0);
 const gap=structuredClone(accepted);gap.limitations.push('Required document was not inspected');
 assert.throws(()=>f.assess(gap),/mandatory gaps/);
 const forged=structuredClone(accepted);forged.limitations.push('Required finding reconciliation not reported: invented');
 assert.throws(()=>f.assess(forged),/mandatory gaps/);
});
