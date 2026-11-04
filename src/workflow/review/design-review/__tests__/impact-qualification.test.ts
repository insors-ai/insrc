import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDesignImpact } from '../results.js';
import { resolveDesignCoverage } from '../provenance.js';
import { designTechnicalFailure } from '../technical-failure.js';
import { DesignReviewError } from '../contracts.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { impactFixture } from './impact-fixtures.js';

test('correction after an invalidated first attempt and full restart can retain the restarted coverage',t=>{
 const f=impactFixture(t),first=structuredClone(f.baseline);first.status='invalidated';delete first.report;delete first.plan;first.completedChunks=[];
 const second=structuredClone(f.baseline);second.number=2;second.report!.attempt=2;
 const current={...f.current,number:3},impact={...f.impact,baselineAttempt:2,retainedCoverage:[{...f.impact.retainedCoverage[0]!,fromAttempt:2}]};
 assert.equal(resolveDesignCoverage([first,second],2,'keep',3,'daemon').attempt,2);
 assert.equal(validateDesignImpact({plan:f.plan,impact},current,[first,second]).impact.retainedCoverage[0]!.fromAttempt,2);
});

test('stored initial reports cannot invent impact projections or nonimpact finding decisions',async t=>{
 const f=impactFixture(t);f.checkpoint.attempts=[f.baseline];
 const bad=structuredClone(f.checkpoint);bad.attempts[0]!.report!.impact={baselineAttempt:1,mode:'full',coverageOrigins:[{chunkId:'keep',kind:'fresh'}],findingDecisions:[],effectiveFindingOrigins:[]};
 await assert.rejects(saveDesignCheckpoint(f.repo,bad),/projection presence/);
 const decision=structuredClone(f.checkpoint);decision.attempts[0]!.completedChunks[0]!.findingDecisions=[];await assert.rejects(saveDesignCheckpoint(f.repo,decision),/not on an impact final/);
 for(const code of ['invalid_checkpoint','foreign_checkpoint','result_too_large','invalid_checkpoint_path','invalid_project','invalid_review_id','checkpoint_too_large','persistence_failed'])assert.equal(designTechnicalFailure(new DesignReviewError(code,'Terminal state/storage failure')),undefined);
 for(const code of ['invalid_plan','invalid_result','invalid_schema','invalid_json','input_too_large'])assert.equal(designTechnicalFailure(new DesignReviewError(code,'Bad reviewer candidate'))!.code,'invalid_output');
});
