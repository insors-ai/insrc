import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';
import { DESIGN_LIMITS, DesignPlanSchema, DesignResultSchema, DesignWorkflowSchema, decodeDesign, parseDesignRequest } from '../contracts.js';

test('strict design requests reject malformed identities, unknown fields, phases and noninitial attempts', () => {
 const start = {phase:'start',repo:'/project',reviewId:'review-1',attempt:1,artifactPath:'docs/DEF.md'};
 assert.deepEqual(parseDesignRequest(start),start);
 for (const patch of [{attempt:2},{attempt:0},{reviewId:'../escape'},{reviewId:''},{phase:'claims'},{commit:'abc'},{artifact:'copied body'},{repo:42}]) {
  assert.throws(()=>parseDesignRequest({...start,...patch}));
 }
 assert.throws(()=>parseDesignRequest({...start,artifactPath:'x'.repeat(DESIGN_LIMITS.path+1)}));
 assert.throws(()=>decodeDesign(Type.Any(),{large:'x'.repeat(20)},10),/bounded JSON/);
 assert.throws(()=>decodeDesign(Type.Any(),{big:1n}),/serializable JSON/);
});

test('common review schemas preserve workflow context and bounded observation without accepting copied content', () => {
 const context={kind:'issue',rootArtifactId:'ISSUE-a',requiredReferences:[{role:'issue',artifactId:'ISSUE-a',path:'docs/ISSUE.md'}],availableReferences:[],notApplicableRoles:['HLD']};
 assert.deepEqual(decodeDesign(DesignWorkflowSchema,context),context);
 assert.throws(()=>decodeDesign(DesignWorkflowSchema,{...context,kind:'guessed'}));
 const query={phase:'progress',repo:'/project',reviewId:'review-1',attempt:1,afterCompletedChunk:0,includeResult:true};
 assert.deepEqual(parseDesignRequest(query),query);
 assert.throws(()=>parseDesignRequest({...query,baseline:'secret'}));
 assert.throws(()=>parseDesignRequest({...query,afterCompletedChunk:-1}));
 const result={chunkId:'chunk-1',status:'passed',summary:'Inspected requirements',findings:[],inspectedReferences:['/body/problem'],limitations:[],advice:[]};
 const snapshot=decodeDesign(DesignResultSchema,result);result.advice.push('later mutation');assert.deepEqual(snapshot.advice,[]);
 assert.throws(()=>decodeDesign(DesignResultSchema,{...result,status:'maybe'}));
 assert.throws(()=>decodeDesign(DesignResultSchema,{...result,summary:'x'.repeat(DESIGN_LIMITS.text+1)}));
 assert.throws(()=>decodeDesign(DesignPlanSchema,{chunks:[],coverageExplanation:'none',finalConsistencyChunkId:'final',coverage:[]}));
 const request={phase:'result',repo:'/project',reviewId:'review-1',attempt:1,executionId:'execution-1',sequence:1,result:snapshot};
 assert.equal(parseDesignRequest(request).phase,'result');
 assert.throws(()=>parseDesignRequest({...request,sequence:0}));
});
