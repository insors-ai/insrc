/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fixture } from './review-investigation-fixtures.js';
import { evaluationOracleSchema,readApprovedEvaluationOracle,scriptedEvaluationRecord,recordEvaluation,evaluateReviewRecords,verifyStoredEvaluation } from '../review-investigation-evaluation.js';
import type { EvaluationBinding,EvaluationRecord } from '../review-investigation-evaluation.js';
import { approvedEvidenceReference } from '../review-investigation-approval.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { digestValue,snapshotValue } from '../../workflow/code-review/investigation/identity.js';
const oracleData=evaluationOracleSchema.parse(JSON.parse(readFileSync(new URL('./fixtures/review-evaluation-oracle.v1.json',import.meta.url),'utf8')));
const baselineData=JSON.parse(readFileSync(new URL('./fixtures/review-evaluation-baseline.v1.json',import.meta.url),'utf8')) as {origin:'recorded-fixture';recordedRef:string;observations:EvaluationRecord['observations'];inputs:string[][]};
async function setup(){
 const f=await fixture(false,false,false),store=f.repository.options.canonical,lifecycle=new LifecycleService({store}),id='ISSUE-6666666666666666';
 const author={id:'insrc:oracle-author',kind:'agent' as const,properties:{}},adjudicator={id:'github:fixture-adjudicator',kind:'person' as const,properties:{}};
 await store.write({id,description:'Synthetic unit oracle, not production qualification',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body:{title:'Executable fixture oracle',reproduction:'Fixed seeded regressions',rootCause:'Fixture',fixIntent:JSON.stringify(oracleData)},citations:[]}},author);
 await lifecycle.apply(id,'approve',adjudicator);const ref=approvedEvidenceReference(id,(await f.repository.work.readCanonicalHead(id))!),oracle=await readApprovedEvaluationOracle(f.repository.work,ref);
 const binding:EvaluationBinding={sourceCommit:'a'.repeat(40),sourceDigest:digestValue('candidate source'),profileDigest:digestValue('profile'),policyDigest:digestValue('policy'),catalogDigest:digestValue('catalog'),schemaVersion:1,adapterVersion:'candidate-script-v1',fixtureVersion:oracleData.fixtureVersion,oracleDigest:oracle.oracleDigest};
 const base=scriptedEvaluationRecord({...binding,sourceCommit:'b'.repeat(40),sourceDigest:digestValue('recorded baseline source'),adapterVersion:'baseline-script-v1'},baselineData.observations,baselineData.inputs,baselineData.recordedRef);
 const {recordDigest:_,...body}=base,baseline=recordEvaluation({...body,origin:'recorded-fixture'});
 const candidate=scriptedEvaluationRecord(binding,baselineData.observations,[['all approved fixture contracts','empty source partition'],['unknown source partition'],['queued source partition'],['clean source partition']],'candidate-script-v1');
 return {...f,store,lifecycle,id,ref,oracle,binding,baseline,candidate,author,adjudicator};
}
function changed(record:EvaluationRecord,change:Partial<Omit<EvaluationRecord,'recordDigest'>>){const {recordDigest:_,...body}=record;return recordEvaluation({...body,...change});}

test('Adjudicated fixture baseline preserves required defects coverage and labelled efficiency metrics',async()=>{
 // Ground-truth probes execute the separately authored fixture bytes; the
 // evaluator never executes source or derives its oracle from candidate output.
 for(const c of oracleData.cases){assert.deepEqual(runInNewContext(`${c.before}\n${c.probe}`,Object.create(null)),c.expected);let actual:unknown;try{actual=runInNewContext(`${c.after}\n${c.probe}`,Object.create(null));}catch{actual='fixture-threw';}if(c.requiredDefects.length)assert.notDeepEqual(actual,c.expected,c.caseId);else assert.deepEqual(actual,c.expected);}
 const f=await setup();try{
  const report=evaluateReviewRecords(f.oracle,f.baseline,f.candidate);assert.equal(report.passed,true);assert.equal(report.requiredDefects.length,3);assert.equal(report.requiredCoverage.length,7);assert.equal(report.metrics.baseline.basis,'recorded-fixture');assert.equal(report.metrics.candidate.basis,'provider-script');assert.ok(report.metrics.candidate.scriptedOrRecordedCalls<report.metrics.baseline.scriptedOrRecordedCalls);assert.ok(report.metrics.candidate.repeatedInputCharacters<report.metrics.baseline.repeatedInputCharacters);assert.deepEqual(verifyStoredEvaluation(report,f.oracle),report);
  const missing=changed(f.candidate,{observations:f.candidate.observations.map((o,i)=>i?o:{...o,foundDefects:[],covered:[]}),calls:[]});const rejected=evaluateReviewRecords(f.oracle,f.baseline,missing);assert.equal(rejected.passed,false);assert.ok(rejected.missingEvidence.includes('missing-defect:empty-reduce-initializer'));assert.ok(rejected.missingEvidence.includes('missing-coverage:empty-total-test'));
  assert.throws(()=>evaluateReviewRecords(f.oracle,f.baseline,changed(f.candidate,{observations:f.candidate.observations.slice(1)})),/Every oracle case/);
  assert.throws(()=>evaluateReviewRecords(f.oracle,f.baseline,changed(f.candidate,{binding:{...f.binding,fixtureVersion:'other'}})),/binding changed/);
  assert.throws(()=>evaluateReviewRecords(f.oracle,f.baseline,{...f.candidate,binding:{...f.binding,policyDigest:'f'.repeat(64)}}),/identity/);
  assert.throws(()=>evaluateReviewRecords(snapshotValue(f.oracle),f.baseline,f.candidate),/oracle authority/);
  assert.throws(()=>evaluateReviewRecords(f.oracle,f.baseline,changed(f.candidate,{producerId:f.adjudicator.id})),/adjudicate/);
  const baselineUnknown=changed(f.baseline,{observations:f.baseline.observations.map((o,i)=>i?o:{...o,foundDefects:[...o.foundDefects,'unadjudicated-baseline-defect']})});assert.equal(evaluateReviewRecords(f.oracle,baselineUnknown,f.candidate).passed,false);
  const unknown=changed(f.candidate,{observations:f.candidate.observations.map((o,i)=>i?o:{...o,foundDefects:[...o.foundDefects,'new-unadjudicated-defect']})});assert.equal(evaluateReviewRecords(f.oracle,f.baseline,unknown).passed,false);
  await f.lifecycle.updateContent(f.id,f.author,{body:{...((await f.store.read(f.id)).payload.body),fixIntent:JSON.stringify({...oracleData,fixtureVersion:'changed'})},citations:[]});await assert.rejects(()=>readApprovedEvaluationOracle(f.repository.work,f.ref));
 }finally{f.close();}
});

test('No default quality or savings claim without separately authorized live evidence',async()=>{
 const f=await setup();try{
  const report=evaluateReviewRecords(f.oracle,f.baseline,f.candidate);assert.equal(report.liveEvidence,false);assert.equal(report.defaultReplacement,false);assert.equal(report.claims.cloudTokenSavings,null);assert.equal(report.claims.realDefectRecall,null);assert.equal(report.claims.defaultQuality,null);assert.equal(report.metrics.candidate.actualTokens,null);assert.equal(report.metrics.candidate.actualCloudLatencyMs,null);assert.equal(report.metrics.candidate.actualModelCalls,null);
  for(const tampered of [{...report,liveEvidence:true},{...report,defaultReplacement:true},{...report,requiredDefects:[]},{...report,metrics:{...report.metrics,candidate:{...report.metrics.candidate,actualTokens:0}}}])assert.throws(()=>verifyStoredEvaluation(tampered,f.oracle));
  assert.throws(()=>changed(f.candidate,{actualTokens:0 as never}));
  // The author cannot assert their own independent adjudication.
  const self='ISSUE-7777777777777777';await f.store.write({id:self,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body:{title:'Self-labelled oracle',fixIntent:JSON.stringify(oracleData)},citations:[]}},f.adjudicator);await f.lifecycle.apply(self,'approve',f.adjudicator);const ref=approvedEvidenceReference(self,(await f.repository.work.readCanonicalHead(self))!);await assert.rejects(()=>readApprovedEvaluationOracle(f.repository.work,ref),/independent/);
 }finally{f.close();}
});
