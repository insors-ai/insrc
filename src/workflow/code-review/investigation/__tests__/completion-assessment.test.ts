/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { completedInvestigationFixture } from './completion-fixtures.js';
import { assessReviewCompletion } from '../completion-assessment.js';
import { initializeReviewLedger } from '../ledger.js';
import { ledgerDigest } from '../ledger-identity.js';
import { SubjectPreparationError } from '../types.js';
import { appendImpactRequirements } from '../ledger-catalog.js';
import { coverageRowId } from '../ledger-identity.js';

test('Completion validates every required row block evidence and independent party', async()=>{
 const f=await completedInvestigationFixture(); try {
  const before=ledgerDigest(f.view), assessment=await assessReviewCompletion(f.view,f.context);
  assert.equal(assessment.outcome,'publishable'); assert.equal(assessment.checkpointDigest,f.view.state.checkpoint);
  assert.deepEqual(assessment.requiredCriteria,f.basis.criteria.map(c=>c.id)); assert.deepEqual(assessment.unresolvedRows,[]);
  assert.equal(ledgerDigest(f.view),before);
  // Accountable findings are completed review outcomes, including HIGH; they are not unfinished execution.
  const covered=f.view.state.ledger.coverage[0]!;
  const finding={findingId:'finding-1',criterion:f.basis.criteria[0]!.id,severity:'HIGH' as const,confidence:'breach' as const,
   evidenceIds:covered.evidenceIds,expectationRefs:[covered.requirementRef],message:'Inspected contract violation'};
  const withFinding={...f.view,state:{...f.view.state,ledger:{...f.view.state.ledger,findings:[finding],coverage:f.view.state.ledger.coverage.map(r=>r===covered?{...r,disposition:'finding' as const,findingIds:[finding.findingId]}:r)}}};
  assert.equal((await assessReviewCompletion(withFinding,f.context)).outcome,'publishable');
  const impact={category:'impact' as const,requirementRef:'impact:caller-1',text:'Changed caller impact',allowNotApplicable:false,needs:'inspection' as const};
  const impactBasis=appendImpactRequirements(f.basis,[impact]);
  const impactRow={...covered,rowId:coverageRowId(f.manifest.subjectDigest,impact),category:impact.category,requirementRef:impact.requirementRef};
  assert.equal((await assessReviewCompletion({...f.view,basis:impactBasis,state:{...f.view.state,ledger:{...f.view.state.ledger,coverage:[...f.view.state.ledger.coverage,impactRow]}}},f.context)).outcome,'publishable');
  for(const row of f.view.state.ledger.coverage){
   const pending=initializeReviewLedger(f.basis).coverage.find(r=>r.rowId===row.rowId)!;
   const view={...f.view,state:{...f.view.state,ledger:{...f.view.state.ledger,coverage:f.view.state.ledger.coverage.map(r=>r===row?pending:r)}}};
   const result=await assessReviewCompletion(view,f.context); assert.equal(result.outcome,'incomplete');assert.ok(result.unresolvedRows.includes(row.rowId));
  }
  for(const disposition of ['needs-followup','unverified'] as const){
   const accepted=f.view.state.accepted.map((a,i)=>i===1?{...a,progress:{...a.progress,disposition}}:a);
   assert.equal((await assessReviewCompletion({...f.view,state:{...f.view.state,accepted}},f.context)).outcome,'incomplete');
  }
  assert.equal((await assessReviewCompletion({...f.view,outstandingWork:['block-2']},f.context)).outcome,'incomplete');
  assert.equal((await assessReviewCompletion({...f.view,accounting:{...f.view.accounting,attempts:f.view.accounting.attempts.map(a=>({...a,state:'partially-accepted'}))}},f.context)).outcome,'incomplete');
  // A failed enclosing call retains its accepted work; usage is not coverage authority.
  assert.equal((await assessReviewCompletion({...f.view,accounting:{...f.view.accounting,attempts:f.view.accounting.attempts.map(a=>({...a,state:'failed'}))}},f.context)).outcome,'publishable');
 } finally {f.cleanup();}
});

test('Completion rejects stale conflicting and unsupported coverage without canonical writes',async()=>{
 const f=await completedInvestigationFixture();try{
  for(const context of [{...f.context,subjectDigest:'changed'}, {...f.context,policyDigest:'changed'},
   {...f.context,compatibility:{...f.context.compatibility,toolsDigest:'changed'}},
   {...f.context,build:{...f.context.build,revision:f.context.build.revision+1}},
   {...f.context,assertFresh:async()=>{throw new SubjectPreparationError('stale-contract','Approved contract changed');}}])
   assert.equal((await assessReviewCompletion(f.view,context)).outcome,'stale');
  for(const context of [{...f.context,reviewerParty:'controller' as const}, {...f.context,reviewerParty:'unknown' as const},
   {...f.context,build:{...f.context.build,meta:{}}}, {...f.context,expectationConflicts:[{reference:'decision-1',reason:'Conflicting approved expectations'}]}])
   assert.equal((await assessReviewCompletion(f.view,context)).outcome,'conflict');
  const row=f.view.state.ledger.coverage[0]!;
  for(const replacement of [{...row,evidenceIds:[]},{...row,disposition:'not-applicable' as const,evidenceIds:[]}]){
   await assert.rejects(()=>assessReviewCompletion({...f.view,state:{...f.view.state,ledger:{...f.view.state.ledger,coverage:f.view.state.ledger.coverage.map(r=>r===row?replacement:r)}}},f.context));
  }
  await assert.rejects(()=>assessReviewCompletion({...f.view,state:{...f.view.state,ledger:{...f.view.state.ledger,coverage:f.view.state.ledger.coverage.slice(1)}}},f.context));
  await assert.rejects(()=>assessReviewCompletion({...f.view,basis:{...f.basis,requirements:[]}},f.context));
  await assert.rejects(()=>assessReviewCompletion(f.view,{...f.context,assertFresh:async()=>{throw Error('storage unavailable');}}),/storage unavailable/);
  assert.equal(existsSync(join(f.repo,'.insrc','artifacts')),false);
 }finally{f.cleanup();}
});
