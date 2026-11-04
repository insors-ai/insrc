import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDesignImpact } from '../results.js';
import { designTechnicalFailure } from '../technical-failure.js';
import { designFindingKey } from '../provenance.js';
import { impactFixture } from './impact-fixtures.js';

test('impact validates complete partition and safe equivalent retention with fresh consistency',t=>{
 const f=impactFixture(t),input={plan:f.plan,impact:f.impact};
 assert.deepEqual(validateDesignImpact(input,f.current,f.history),input);
 for(const patch of [{directChunkIds:[]},{indirectChunkIds:['edit']},{consistencyChunkIds:[]},{directChunkIds:['absent']},{retainedCoverage:[...f.impact.retainedCoverage,{...f.impact.retainedCoverage[0]!,chunkId:'final'}]},{chunkMapping:[]},{carriedFindingIds:['unknown']},{baselineAttempt:2}])assert.throws(()=>validateDesignImpact({...input,impact:{...f.impact,...patch}},f.current,f.history));
 const renamed=structuredClone(input);renamed.plan.chunks[0]!.id='renamed';renamed.plan.chunks[1]!.dependsOn=['renamed'];renamed.plan.chunks[2]!.dependsOn=['renamed','edit'];renamed.plan.coverage.forEach(r=>r.chunkIds=['renamed','edit']);renamed.impact.retainedCoverage[0]!.chunkId='renamed';renamed.impact.chunkMapping[0]!.currentIds=['renamed'];
 assert.equal(validateDesignImpact(renamed,f.current,f.history).impact.retainedCoverage[0]!.chunkId,'renamed');
 for(const change of ['concerns','selectors','dependsOn'] as const){const bad=structuredClone(input);bad.plan.chunks[0]![change]=change==='selectors'?[]:['edit'];assert.throws(()=>validateDesignImpact(bad,f.current,f.history));}
 const limited=structuredClone(f.history);limited[0]!.completedChunks[0]!.limitations=['Unavailable required coverage'];assert.throws(()=>validateDesignImpact(input,f.current,limited),/Incomplete coverage/);
 const foreign=structuredClone(f.history);foreign[0]!.reviewer='controller';assert.throws(()=>validateDesignImpact(input,f.current,foreign),/full mode/);
});

test('explicit full fallback consumes no retry while unsafe selective output is classified invalid_output',t=>{
 const f=impactFixture(t),full={...f.impact,mode:'full' as const,directChunkIds:['keep','edit'],retainedCoverage:[],uncertainReason:'Indirect effects cannot be bounded'};
 assert.equal(validateDesignImpact({plan:f.plan,impact:full},f.current,f.history).impact.mode,'full');
 const party=structuredClone(f.history);party[0]!.reviewer='controller';assert.equal(validateDesignImpact({plan:f.plan,impact:full},f.current,party).impact.mode,'full');
 let failure:unknown;try{validateDesignImpact({plan:f.plan,impact:{...f.impact,uncertainReason:'uncertain'}},f.current,f.history);}catch(e){failure=e;}
 assert.equal((failure as {code:string}).code,'invalid_plan');assert.equal(designTechnicalFailure(failure)?.code,'invalid_output');
 assert.throws(()=>validateDesignImpact({plan:f.plan,impact:full},{...f.current,preparationKind:'planning'},f.history),{code:'invalid_checkpoint'});
 try{validateDesignImpact({plan:f.plan,impact:full},f.current,[]);assert.fail('Expected state rejection');}catch(e){assert.equal(designTechnicalFailure(e),undefined);}
});

test('impact carries canonical effective finding tuples and rejects missing or invented origins',t=>{
 const f=impactFixture(t);f.baseline.completedChunks[0]!.findings.push({id:'f1',severity:'HIGH',location:'/body/summary',message:'Known blocker',evidenceReferences:[f.md]});f.baseline.status='changes_requested';f.baseline.report!.status='changes_requested';f.baseline.report!.chunks=structuredClone(f.baseline.completedChunks);f.baseline.report!.counts.HIGH=1;
 const key=designFindingKey({attempt:1,chunkId:'keep',findingId:'f1'}),input={plan:f.plan,impact:{...f.impact,carriedFindingIds:[key]}};
 assert.deepEqual(validateDesignImpact(input,f.current,f.history).impact.carriedFindingIds,[key]);
 assert.throws(()=>validateDesignImpact({plan:f.plan,impact:f.impact},f.current,f.history),/every known/);
 assert.throws(()=>validateDesignImpact({...input,impact:{...input.impact,carriedFindingIds:['f1']}},f.current,f.history),/every known/);
});
