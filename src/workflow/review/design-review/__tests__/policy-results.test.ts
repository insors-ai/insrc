import test from 'node:test';
import assert from 'node:assert/strict';
import { designPlanningPrompt, designChunkPrompt } from '../policy.js';
import { validateDesignPlan, assessDesignResult, consolidateDesignReview } from '../results.js';
import type { DesignReviewSubject, DesignChunkPlan, DesignReviewInventory } from '../contracts.js';

const inventory:DesignReviewInventory={units:[{id:'/body/a',selector:'/body/a',title:'A',kind:'section'},{id:'/body/b',selector:'/body/b',title:'B',kind:'section'}]};
const plan:DesignChunkPlan={chunks:[{id:'a',title:'Capability',selectors:['/body/a','/body/b'],concerns:['Requirements and contracts'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Cross-chunk alignment'],dependsOn:['a'],purpose:'consistency'}],coverageExplanation:'Related concerns stay together',finalConsistencyChunkId:'final',coverage:[{unitId:'/body/a',chunkIds:['a']},{unitId:'/body/b',chunkIds:['a']}]};
const subject:DesignReviewSubject={project:'/project',artifactId:'LLD-aaaaaaaaaaaaaaaa-s1',kind:'LLD',canonicalPath:'/project/.insrc/artifacts/LLD.json',documentPath:'/project/docs/LLD.md',reviewer:'daemon',workflow:{kind:'issue',rootArtifactId:'ISSUE-aaaaaaaaaaaaaaaa',requiredReferences:[{role:'originating_issue',artifactId:'ISSUE-aaaaaaaaaaaaaaaa',path:'/project/docs/ISSUE.md'}],availableReferences:[],notApplicableRoles:['HLD','PLAN']}};
const result=(chunkId='a')=>({chunkId,status:'passed' as const,summary:'Inspected coherent scope',findings:[],inspectedReferences:['/body/a','/body/b'],limitations:[],advice:['Optional execution: no tests run']});
test('artifact-specific prompts contain live paths and trailing schema, never copied artifact content',()=>{
 for(const kind of ['DEF','HLD','LLD'] as const){
  const current={...subject,kind,reviewedContent:'UNIQUE_ARTIFACT_BODY_CANARY'};const prompt=designPlanningPrompt(current,'/project/.insrc/tmp/design-review/review.json');
  assert.ok(prompt.includes(current.documentPath));assert.ok(prompt.includes('READ-ONLY'));assert.ok(prompt.includes('every substantive chunk'));
  assert.ok(!prompt.includes('UNIQUE_ARTIFACT_BODY_CANARY'));assert.ok(prompt.indexOf('Output schema')>prompt.indexOf('Not applicable'));
  assert.doesNotThrow(()=>JSON.parse(prompt.split('Output schema (structural reference):\n')[1]!));
 }
 const prompt=designChunkPrompt(subject,plan.chunks[0]!,'/checkpoint');assert.ok(prompt.includes('originating_issue'));assert.ok(prompt.includes('does not')||prompt.includes('Do not'));assert.ok(prompt.includes('HIGH/MED'));
 const final=designChunkPrompt(subject,plan.chunks[1]!,'/checkpoint');assert.ok(final.includes('all accepted completed feedback'));assert.ok(final.includes('whole-artifact'));
});
test('chunk plans reject missing units, final-only coverage, duplicate ids, cycles and bad final checks',()=>{
 assert.deepEqual(validateDesignPlan(plan,inventory),plan);
 const modify=(change:(p:DesignChunkPlan)=>void)=>{const p=structuredClone(plan);change(p);assert.throws(()=>validateDesignPlan(p,inventory));};
 modify(p=>p.coverage.pop());modify(p=>p.coverage[0]!.chunkIds=['final']);modify(p=>p.chunks[1]!.id='a');
 modify(p=>p.chunks[0]!.dependsOn=['final']);modify(p=>p.chunks[1]!.dependsOn=[]);modify(p=>p.chunks[0]!.selectors=['/unknown']);
 modify(p=>p.chunks.reverse());modify(p=>p.coverage.push(p.coverage[0]!));
});
test('required gaps cannot pass and consolidation preserves HIGH/MED, incomplete and advice semantics',()=>{
 const chunk=plan.chunks[0]!;assert.equal(assessDesignResult(result(),chunk,[]).status,'passed');
 const finalGap=assessDesignResult(result('final'),plan.chunks[1]!,[],['/project/docs/LLD.md','/checkpoint']);assert.equal(finalGap.status,'incomplete');assert.equal(finalGap.limitations.length,2);
 const gap=assessDesignResult({...result(),inspectedReferences:['/body/a']},chunk,[]);assert.equal(gap.status,'incomplete');assert.ok(gap.limitations[0]!.includes('/body/b'));
 const finding={id:'f1',severity:'MED' as const,location:'/body/a',message:'Contract contradiction',evidenceReferences:['/project/source.ts:5']};
 assert.throws(()=>assessDesignResult({...result(),findings:[finding]},chunk,[]),/Status contradicts/);
 const blocked=assessDesignResult({...result(),status:'changes_requested',findings:[finding]},chunk,[]);
 const final=assessDesignResult(result('final'),plan.chunks[1]!,[blocked]);
 assert.throws(()=>consolidateDesignReview('review',1,subject,'a'.repeat(64),plan,[blocked]),/Every planned/);
 assert.equal(consolidateDesignReview('review',1,subject,'a'.repeat(64),plan,[blocked,final]).status,'changes_requested');
 assert.equal(consolidateDesignReview('review',1,subject,'a'.repeat(64),plan,[gap,final]).status,'incomplete');
 assert.throws(()=>assessDesignResult({...result('final'),status:'changes_requested',findings:[finding]},plan.chunks[1]!,[blocked]),/already used/);
 const low=assessDesignResult({...result(),findings:[{...finding,severity:'LOW'}]},chunk,[]);assert.equal(low.status,'passed');assert.equal(low.advice.length,1);
});
