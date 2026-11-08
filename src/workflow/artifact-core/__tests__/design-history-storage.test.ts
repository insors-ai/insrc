import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { impactFixture } from '../../review/design-review/__tests__/impact-fixtures.js';
import { designPreservationDigest, designWorkflowDigest } from '../../review/design-review/history.js';
import { checkSidecarEntrySize, MAX_SIDECAR_ENTRY_BYTES, sidecarOuterLimit, designHistoryLimit } from '../sidecar.js';
import { FileSidecarStore } from '../sidecar-store.js';
import { durableKit } from './durable-kit.js';
import { createFileJournal } from '../journal.js';
import type { ChangeLogEntry } from '../types.js';
import { artifact, alice, H } from './store-kit.js';

test('design history alone receives a bounded UTF-8 allowance in sync and async readers', async t => {
 const f = impactFixture(t); f.checkpoint.attempts = [f.baseline];
 f.baseline.baseline.reviewedContent.document = 'é'.repeat(150000);
 const data = { kind:'design-chunk-review', schemaVersion:1, reviewId:'review-1', project:f.repo, artifactId:f.id, subject:f.prepared.subject, submitted:f.checkpoint.submitted,
  attempts:[f.baseline], applicableAttempt:1, status:'passed', reviewer:f.prepared.subject.reviewer,
  binding:{sourceRevision:{number:1,contentHash:'a'.repeat(64)},reviewedContentIdentity:f.baseline.baseline.contentIdentity,documentDigest:f.baseline.baseline.subjectFingerprints.document,workflowDigest:designWorkflowDigest(f.prepared.subject.workflow),author:'controller'},preservationDigest:designPreservationDigest(f.checkpoint)};
 const record = { artifactId:f.id, entry:{id:'fixed-entry',timestamp:'2026-11-01T00:00:00Z',operation:'review',outcome:{result:'pass',summary:'Review',data}} };
 const n = Buffer.byteLength(JSON.stringify(record)); assert.ok(n>MAX_SIDECAR_ENTRY_BYTES);
 assert.equal(Buffer.byteLength(checkSidecarEntrySize(record,n)),n);
 assert.throws(()=>checkSidecarEntrySize(record,n-1));
 const config=join(f.repo,'capacity-config.json'); writeFileSync(config,JSON.stringify({review:{maxJsonBytes:1024}}));
 assert.equal(designHistoryLimit(config),1024); assert.throws(()=>checkSidecarEntrySize(record,designHistoryLimit(config)));
 assert.throws(()=>checkSidecarEntrySize({...record,entry:{...record.entry,outcome:{...record.entry.outcome,data:{...data,kind:'unknown'}}}}));
 const store = new FileSidecarStore(f.repo); await store.appendRecord('log',record);
 assert.deepEqual(store.readRecordsSync('log',f.id),[record.entry]); assert.deepEqual(await store.readRecords('log',f.id),[record.entry]);
 const journal=createFileJournal(f.repo), operation={operationId:record.entry.id,priorRevision:0,priorHeadHash:'absent',bytes:'{}',entry:{...record.entry,actor:alice} as ChangeLogEntry};
 await journal.stage(f.id,operation); assert.deepEqual(await journal.pending(f.id),operation); await journal.clear(f.id,operation.operationId);
 await assert.rejects(journal.stage(f.id,{...operation,bytes:'\u0000'.repeat(Math.floor(sidecarOuterLimit()/5))}),/Journal envelope/);
 writeFileSync(join(f.repo,store.filesOf(f.id).log),`${sidecarOuterLimit()+1}\t{}\n`);
 const concat=Buffer.concat; let allocations=0;
 Buffer.concat=((...args:Parameters<typeof Buffer.concat>)=>{allocations++;return concat(...args);}) as typeof Buffer.concat;
 try { assert.throws(()=>store.readRecordsSync('log',f.id),/Declared/); assert.equal(allocations,0,'reject the declared header before frame-body concatenation'); } finally { Buffer.concat=concat; }
 await assert.rejects(store.readRecords('log',f.id),/Declared/);
 const padded=JSON.stringify({artifactId:f.id,entry:{id:'unknown',kind:'unknown'}})+' '.repeat(MAX_SIDECAR_ENTRY_BYTES);
 writeFileSync(join(f.repo,store.filesOf(f.id).log),`${Buffer.byteLength(padded)}\t${padded}\n`);
 assert.throws(()=>store.readRecordsSync('log',f.id),/actual encoded/);
 await assert.rejects(store.readRecords('log',f.id),/actual encoded/);
});
test('deterministic history id survives append and replace crashes and rejects conflicting replay', async t => {
 for (const fault of ['append','replace'] as const) {
  const k=durableKit(); t.after(()=>k.done()); const id=`LLD-${H}-s1`; await k.store.write(artifact(`DEF-${H}`),alice); await k.store.write(artifact(id),alice);
  const entryId='d'.repeat(32), options={entryId,operation:'update' as const,outcome:{result:'saved',summary:'Durable'}};
  k.faults[fault]=true;
  await assert.rejects(k.store.updateAndLog(id,alice,current=>({next:{...current,description:'Published'},options})));
  const restarted=k.restart(); await restarted.store.finishPending(id);
  const replay=await restarted.store.updateAndLog(id,alice,current=>({next:current,options}));
  assert.equal(replay.wrote,false); assert.equal(replay.entry!.id,entryId);
  assert.equal((await restarted.store.readWithHistory(id)).changeLog.filter(e=>e.id===entryId).length,1);
  await assert.rejects(restarted.store.updateAndLog(id,alice,current=>({next:current,options:{...options,outcome:{result:'different',summary:'Conflict'}}})),/Conflicting/);
  await assert.rejects(restarted.store.updateAndLog(id,alice,current=>({next:{...current,description:'Different content'},options})),/Conflicting/);
  await assert.rejects(restarted.store.updateAndLog(id,alice,current=>({next:current,options:{...options,addresses:[]}})),/Conflicting/);
  await assert.rejects(restarted.store.updateAndLog(id,alice,current=>({next:{...current,references:[{entityId:'external-target',type:'url',relation:'related'}]},options})),/Conflicting/);
  const before=readFileSync(join(k.repo,`.insrc/artifacts/${id}.json`),'utf8');
  const existing=(await restarted.store.readWithHistory(id)).changeLog.find(e=>e.id===entryId)!;
  const staged={operationId:entryId,priorRevision:existing.revision!.number,priorHeadHash:'absent',bytes:before,entry:{...existing,outcome:{result:'forged',summary:'Conflict'}}};
  await restarted.journal.stage(id,staged);
  await assert.rejects(restarted.store.finishPending(id),/different content/);
  assert.deepEqual(await restarted.journal.pending(id),staged);
  assert.equal(readFileSync(join(k.repo,`.insrc/artifacts/${id}.json`),'utf8'),before);
 }
});
