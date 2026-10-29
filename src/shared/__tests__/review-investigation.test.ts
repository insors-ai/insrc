/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewInvestigationCommand,selectReviewInvestigationEngine,INVESTIGATION_ENGINE } from '../review-investigation.js';
import { buildConfigCatalog } from '../../config/config-catalog.js';
import type { ReviewClientStatusV1 } from '../review-investigation.js';

test('Strict investigation commands status schema and default legacy selection',()=>{
 const start={version:1,engine:INVESTIGATION_ENGINE,repo:'/repo',operation:'start',requestId:'11111111-1111-4111-8111-111111111111',repoId:'repo',
  rootArtifactId:'DEF-root',storyId:'s6',buildArtifactId:'BUILD-root-s6',selections:[{commitId:'a'.repeat(40),parentId:'b'.repeat(40),attestationRef:'scope-1'}],sourceMode:'source-only'};
 assert.deepEqual(parseReviewInvestigationCommand(start),start);
 assert.equal(parseReviewInvestigationCommand({...start,selections:[{...start.selections[0]!,commitId:'a'.repeat(64),parentId:'b'.repeat(64)}]}).operation,'start');
 for(const bad of [{...start,version:2},{...start,engine:'legacy'},{...start,reviewerParty:'daemon'},{...start,operation:'approve'},
  {...start,selections:[{...start.selections[0]!,approved:true}]},{...start,sourceMode:'full'}, {...start,selections:[]}])assert.throws(()=>parseReviewInvestigationCommand(bad),{code:'invalid-command'});
 const bound={version:1,engine:INVESTIGATION_ENGINE,repo:'/repo',runId:'run-1',bindingId:'opaque',subjectDigest:'a'.repeat(64),generation:1,attemptId:'attempt-1',requestDigest:'b'.repeat(64)};
 assert.equal(parseReviewInvestigationCommand({...bound,operation:'read',reference:'bounded-ref'}).operation,'read');
 assert.throws(()=>parseReviewInvestigationCommand({...bound,operation:'read',reference:'x',readOnly:true}));
 assert.throws(()=>parseReviewInvestigationCommand({...bound,operation:'reply',reply:{findings:[],verdict:'pass'}}));
 const status={version:1,engine:INVESTIGATION_ENGINE,runId:'run-1',subjectDigest:'a'.repeat(64),generation:1,state:'prepared',coverageRef:'run-1/coverage',covered:0,required:1,unresolved:['row-1'],
  resume:{available:true,reason:null},consumption:{reportedRef:null,estimatedInputTokens:null,unavailableAttempts:0,activeMs:0,continuationCount:0},receipt:null,error:null} satisfies ReviewClientStatusV1;
 assert.equal(status.consumption.estimatedInputTokens,null);assert.equal('latestBlockReceipt' in status,false);
 assert.throws(()=>parseReviewInvestigationCommand({...start,repo:'x'.repeat(1024*1024)}),{code:'invalid-command'});
 assert.deepEqual(selectReviewInvestigationEngine(undefined),{engine:'legacy',admitted:true,reasons:[]});
 assert.equal(selectReviewInvestigationEngine(INVESTIGATION_ENGINE).admitted,false);
 assert.equal(selectReviewInvestigationEngine(INVESTIGATION_ENGINE).reasons.length,4);
 assert.throws(()=>selectReviewInvestigationEngine('auto'),{code:'unsupported-version'});
 const catalog=buildConfigCatalog();assert.equal(catalog.find(x=>x.path==='codeReview.engine')?.default,'legacy');
 assert.equal(catalog.find(x=>x.path==='codeReview.investigationReadinessRef')?.default,'');
});
