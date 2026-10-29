/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import { runRecoveredContinuation } from '../recovery-session.js';
import { finalReply } from './continuation-fixtures.js';
import type { InvestigationTurnV1, InvestigationTools } from '../continuation-types.js';
import { runInvestigationContinuation } from '../continuation.js';
test('Two-block sc3 session crash resume preserves accepted work and accounting',{timeout:30000},async()=>{
 for(const boundary of ['blob-file-synced','blob-installed','event-written','event-synced','after-first-ack','after-second-ack']){
  const f=recoveryFixture(),path=join(f.repo,'manifest.json');writeFileSync(path,JSON.stringify(f.manifest));
  const child=fork(new URL('./recovery-crash-worker.ts',import.meta.url),[f.repo,path,boundary],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
  const timer=setTimeout(()=>child.kill('SIGKILL'),7000);
  try{
   const [message]=await once(child,'message',{signal:AbortSignal.timeout(8000)});assert.deepEqual(message,{boundary});
   const exit=once(child,'exit');child.kill('SIGKILL');await exit;
   const reopened=new RecoveryStore(f.repo,f.turn.runId,{...f.options,processEpoch:'restarted-daemon'});const lease=await reopened.claim(300000);
   const view=reopened.replay();const count=['blob-file-synced','blob-installed'].includes(boundary)?0:boundary==='after-second-ack'?2:1;
   assert.equal(view.state.sequence,count);assert.equal(view.accounting.attempts[0]!.state,'uncertain');assert.equal(view.state.consumedActiveMs,1000);
   let dispatched:readonly string[]=[];
   await runRecoveredContinuation(reopened,lease,{...f.turn,assignment:['block-1','block-2']},{...f.context,backend:{...f.context.backend,execute:async (turn,tools)=>{dispatched=turn.assignment;return finalReply(turn,view.state.accepted.map(a=>a.receipt.progressId),count);}}});
   assert.ok(view.state.accepted.every(a=>!dispatched.includes(a.progress.blockId)));assert.equal(reopened.status().continuationsConsumed,2);
   assert.ok(reopened.replay().state.usage.every(u=>u.observation.quality==='unavailable'));
  }finally{clearTimeout(timer);child.kill('SIGKILL');f.cleanup();}
 }
});
test('Source-only and indexed-impact recovery with legacy routing unchanged',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);
  const backend={...f.context.backend,execute:async(turn:InvestigationTurnV1,tools:InvestigationTools)=>{await tools.impact.queryChangedEntityCallers('changed-entity');const accepted=f.store.replay().state;return finalReply(turn,accepted.accepted.map(a=>a.receipt.progressId),accepted.sequence);}};
  // The existing sc3 native impact test suite exercises packet-bound caller receipts. Here we prove the appended basis survives disk replay.
  const input={...f.context,backend,impact:{mode:'indexed-impact' as const,index:{revision:'idx',freshness:'stale' as const,completeness:'partial' as const},queryChangedEntityCallers:async()=>[]},changedEntity:()=>({blockId:'block-1',sourceDigest:'a'.repeat(64)})};
  await runRecoveredContinuation(f.store,lease,f.turn,input);
  const view=f.store.replay();assert.equal(view.basis.subject.subjectDigest,f.manifest.subjectDigest);assert.ok(view.basis.requirements.some(r=>r.category==='impact'));assert.ok(view.outstandingWork.some(r=>r.startsWith('impact:')));
  assert.equal(view.state.usage[0]!.observation.quality,'unavailable');
  // Legacy sc3 remains callable independently; no default entrypoint was re-registered.
  assert.equal(typeof runInvestigationContinuation,'function');
  const incompatible=new RecoveryStore(f.repo,f.turn.runId,{...f.options,currentCompatibility:{...f.options.currentCompatibility,providerDigest:'different-provider'}});
  await assert.rejects(()=>runRecoveredContinuation(incompatible,lease,f.turn,f.context),{code:'stale'});
 }finally{f.cleanup();}
});

test('Recovered evidence findings and receipt provenance remain linked',async()=>{
 const f=recoveryFixture();try{
  const {inspectionFixture}=await import('./ledger-fixtures.js');const {progressFor}=await import('./continuation-fixtures.js');
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);
  const native=inspectionFixture(f.basis);
  const context={...f.context,inspect:async(_reference:string,attemptId:string)=>({read:native.readReceipt!,inspection:{...native,attempt:{...native.attempt,attemptId}}}),backend:{...f.context.backend,execute:async(turn:InvestigationTurnV1,tools:InvestigationTools)=>{
   const read=await tools.read(native.readReceipt!.reference),row=f.context.state.ledger.coverage.find(r=>r.category==='task')!;
   const finding={findingId:'retained-finding',criterion:'quality',severity:'MED' as const,confidence:'observation' as const,evidenceIds:[read.evidenceId],expectationRefs:[row.requirementRef],message:'Retain this independently observed concern.'};
   const receipt=await tools.progress({...progressFor(turn,'block-1',0),disposition:'reviewed',evidenceIds:[read.evidenceId],findings:[finding],coverageUpdates:[{...row,disposition:'finding',evidenceIds:[read.evidenceId],findingIds:[finding.findingId],rationale:'Inspected pinned evidence',assessedByAttempt:turn.attemptId}]});
   return finalReply(turn,[receipt.progressId],1);
  }}};
  await runRecoveredContinuation(f.store,lease,f.turn,context);await f.store.release(lease.leaseId,lease.generation);
  const reopened=new RecoveryStore(f.repo,f.turn.runId,f.options);const current=await reopened.claim(300000);const before=reopened.replay();
  await runRecoveredContinuation(reopened,current,f.turn,{...f.context,backend:{...f.context.backend,execute:async turn=>finalReply(turn,before.state.accepted.map(a=>a.receipt.progressId),before.state.sequence)}});
  const after=reopened.replay();assert.deepEqual(after.state.ledger.findings,before.state.ledger.findings);assert.equal(after.state.ledger.evidence.length,1);assert.equal(after.receipts.length,1);assert.ok(after.state.ledger.coverage.some(r=>r.findingIds.includes('retained-finding')));
 }finally{f.cleanup();}
});
