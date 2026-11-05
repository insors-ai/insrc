import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDesignCoverage, validateDesignRetainedSource } from '../provenance.js';
import { designFixture } from './fixtures.js';
import type { DesignAttempt } from '../contracts.js';

function history(t:Parameters<typeof designFixture>[0]):DesignAttempt[]{
 const f=designFixture(t),base=structuredClone(f.checkpoint.attempts[0]!);
 base.reviewer='daemon';base.status='passed';
 base.plan={chunks:[{id:'keep',title:'Keep',selectors:['/body/summary'],concerns:['correctness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['consistency'],dependsOn:['keep'],purpose:'consistency'}],coverageExplanation:'all',finalConsistencyChunkId:'final',coverage:[{unitId:'/body/summary',chunkIds:['keep']}]};
 base.completedChunks=base.plan.chunks.map(c=>({chunkId:c.id,status:'passed',summary:'Accepted deterministic fixture',findings:[],inspectedReferences:['/body/summary'],limitations:[],advice:[]}));
 base.report={reviewId:'r1',attempt:1,artifactId:f.id,status:'passed',counts:{HIGH:0,MED:0,LOW:0},chunks:base.completedChunks,limitations:[],reviewer:'daemon',reviewedContentIdentity:base.baseline.contentIdentity};
 const second=structuredClone(base);second.number=2;second.report!.attempt=2;second.completedChunks=second.completedChunks.filter(r=>r.chunkId==='final');
 second.impact={baselineAttempt:1,mode:'affected_chunks',changes:[],directChunkIds:[],indirectChunkIds:[],rationale:'Unchanged',chunkMapping:[{priorIds:['keep'],currentIds:['keep'],explanation:'Unchanged'}],retainedCoverage:[{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Unchanged'}],carriedFindingIds:[],consistencyChunkIds:['final']};
 return[base,second];
}

test('backward provenance resolves eligible chains and preserves findings without copying historical bodies',t=>{
 const attempts=history(t),result=attempts[0]!.completedChunks[0]!;result.status='changes_requested';result.findings.push({id:'f1',severity:'HIGH',location:'/body/summary',message:'Known blocker',evidenceReferences:['docs/LLD.md']});
 const resolved=resolveDesignCoverage(attempts,2,'keep',3,'daemon');assert.equal(resolved.result,result);assert.equal(resolved.attempt,1);
 const ref={chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'equivalent'};
 assert.equal(validateDesignRetainedSource(attempts,2,'keep',ref,{number:3,reviewer:'daemon'}).result,result);
 attempts[1]!.status='incomplete';assert.equal(resolveDesignCoverage(attempts,2,'keep',3,'daemon').attempt,1);
});

test('retained origin rejection matrix prevents foreign forward cyclic missing invalidated and incomplete reuse',t=>{
 const base=history(t);
 for(const mutate of [
  (h:DesignAttempt[])=>{h[1]!.impact!.retainedCoverage[0]!.fromAttempt=2;},
  (h:DesignAttempt[])=>{h[1]!.impact!.retainedCoverage[0]!.fromAttempt=3;},
  (h:DesignAttempt[])=>{h[0]!.reviewer='controller';},
  (h:DesignAttempt[])=>{h[1]!.report!.artifactId='LLD-foreign';},
  (h:DesignAttempt[])=>{h[1]!.report!.reviewId='foreign';},
  (h:DesignAttempt[])=>{h[0]!.status='invalidated';},
  (h:DesignAttempt[])=>{h[0]!.completedChunks=[];},
  (h:DesignAttempt[])=>{h[0]!.completedChunks[0]!.status='incomplete';},
  (h:DesignAttempt[])=>{h[0]!.completedChunks[0]!.limitations=['Unavailable evidence'];},
  (h:DesignAttempt[])=>{h[1]!.completedChunks.push(structuredClone(h[0]!.completedChunks[0]!));},
  (h:DesignAttempt[])=>{h[1]!.impact!.retainedCoverage[0]!.fromChunkId='absent';}
 ]){const h=structuredClone(base);mutate(h);assert.throws(()=>resolveDesignCoverage(h,2,'keep',3,'daemon'));}
 assert.throws(()=>resolveDesignCoverage(base,1,'final',3,'daemon'));
 assert.throws(()=>resolveDesignCoverage(base,1,'keep',3,undefined));
 const broken=structuredClone(base);broken[0]!.completedChunks[0]!.summary='';assert.throws(()=>resolveDesignCoverage(broken,2,'keep',3,'daemon'),{code:'invalid_checkpoint'});
 const foreign=structuredClone(base);foreign[0]!.number=9;assert.throws(()=>resolveDesignCoverage(foreign,2,'keep',3,'daemon'),{code:'invalid_checkpoint'});
 const newer=structuredClone(base);newer[1]!.impact!.retainedCoverage=[];newer[1]!.completedChunks.unshift({...structuredClone(newer[0]!.completedChunks[0]!),status:'incomplete',limitations:['Not verified']});
 assert.throws(()=>validateDesignRetainedSource(newer,2,'keep',{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Old pass'},{number:3,reviewer:'daemon'}),/Incomplete coverage/);
 const before=JSON.stringify(base);assert.throws(()=>resolveDesignCoverage(base,3,'keep',3,'daemon'));assert.equal(JSON.stringify(base),before);
});

test('retained source comparison rejects an older valid result when newer mapped coverage is also valid',t=>{
 const h=history(t),latest=h[1]!;
 delete latest.impact;
 latest.completedChunks=structuredClone(h[0]!.completedChunks);latest.completedChunks[0]!.summary='Newer accepted substantive inspection';latest.report!.chunks=structuredClone(latest.completedChunks);
 // Both sources are individually eligible: only the baseline/candidate identity comparison must reject the older one.
 assert.equal(resolveDesignCoverage(h,1,'keep',3,'daemon').attempt,1);
 assert.equal(resolveDesignCoverage(h,2,'keep',3,'daemon').attempt,2);
 const before=JSON.stringify(h);
 assert.throws(()=>validateDesignRetainedSource(h,2,'keep',{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Older individually valid pass'},{number:3,reviewer:'daemon'}),/bypasses the immediately preceding mapped coverage/);
 assert.equal(JSON.stringify(h),before);
 assert.equal(validateDesignRetainedSource(h,2,'keep',{chunkId:'keep',fromAttempt:2,fromChunkId:'keep',justification:'Current mapped inspection'},{number:3,reviewer:'daemon'}).attempt,2);
});
