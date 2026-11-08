import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { impactFixture } from './impact-fixtures.js';
import { publishDesignReview } from '../publication.js';
import { recordDesignAdmission } from '../approval.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { ArtifactStore } from '../../../artifact-core/store.js';
import { LifecycleService } from '../../../artifact-core/lifecycle-service.js';
import { createCompletionEvidence } from '../../../artifact-core/completion-evidence.js';
import { History } from '../../../artifact-core/history.js';
import { FileSidecarStore } from '../../../artifact-core/sidecar-store.js';
import { createFileJournal } from '../../../artifact-core/journal.js';
const actor={id:'person:test',kind:'person' as const,properties:{}};
test('FIFO document replacements refuse publication approval and recovery without blocking',async t=>{
 if(process.env['INSRC_S4_DOCUMENT_FIFO_CHILD']!=='1'){
  const env={...process.env,INSRC_S4_DOCUMENT_FIFO_CHILD:'1'};delete env.NODE_TEST_CONTEXT;
  const child=spawnSync(process.execPath,['--import','tsx','--test','--test-name-pattern=^FIFO document replacements',fileURLToPath(import.meta.url)],{env,encoding:'utf8',timeout:15000});
  assert.ifError(child.error);assert.equal(child.status,0,child.stdout+child.stderr);assert.match(child.stdout,/FIFO_DOCUMENT_CASES_VERIFIED=4/);return;
 }
 for(const operation of ['publication','approval'])for(const phase of ['stage','append']){
  const f=impactFixture(t);f.checkpoint.attempts=[f.baseline];await recordDesignAdmission(f.checkpoint);
  if(operation==='approval'){f.baseline.publication=await publishDesignReview(f.checkpoint);await saveDesignCheckpoint(f.repo,f.checkpoint);}
  const md=readFileSync(f.md,'utf8'),head=readFileSync(f.json,'utf8'),files=new FileSidecarStore(f.repo),base=createFileJournal(f.repo);let replaced=false;
  const replace=()=>{if(!replaced){replaced=true;unlinkSync(f.md);execFileSync('mkfifo',[f.md]);}};
  const history=new History({readRecords:(file,id)=>files.readRecords(file,id),appendRecord:async(file,record)=>{await files.appendRecord(file,record);if(phase==='append')replace();}});
  const journal={...base,stage:async(id:Parameters<typeof base.stage>[0],op:Parameters<typeof base.stage>[1])=>{await base.stage(id,op);if(phase==='stage')replace();}};
  const store=new ArtifactStore({repoPath:f.repo,history,journal}),service=new LifecycleService({store,evidence:()=>createCompletionEvidence(f.repo)});
  await assert.rejects(operation==='approval'?service.apply(f.id,'approve',actor):publishDesignReview(f.checkpoint,{store}),/document changed|Unbounded document/i);
  assert.equal(readFileSync(f.json,'utf8'),head);
  const pending=await base.pending(f.id);assert.ok(pending!.expectedDocument);
  const restarted=new ArtifactStore({repoPath:f.repo,history:new History(new FileSidecarStore(f.repo)),journal:createFileJournal(f.repo)});
  await assert.rejects(restarted.finishPending(f.id),/document changed|Unbounded document/i);
  assert.equal(readFileSync(f.json,'utf8'),head);assert.deepEqual(await base.pending(f.id),pending);
  unlinkSync(f.md);writeFileSync(f.md,md);await restarted.finishPending(f.id);
  assert.equal(await base.pending(f.id),undefined);
  assert.equal((await restarted.history.log(f.id)).filter(e=>e.id===pending!.operationId).length,1);
  assert.equal((await restarted.read(f.id)).lifecycle.status,operation==='approval'?'approved':'draft');
 }
 process.stdout.write('FIFO_DOCUMENT_CASES_VERIFIED=4\n');
});
test('document edits during publication and approval persistence fail closed through journal restart',async t=>{
 for(const operation of ['publication','approval'])for(const phase of ['stage','append']){
  const f=impactFixture(t);f.checkpoint.attempts=[f.baseline];await recordDesignAdmission(f.checkpoint);
  if(operation==='approval'){f.baseline.publication=await publishDesignReview(f.checkpoint);await saveDesignCheckpoint(f.repo,f.checkpoint);}
  const md=readFileSync(f.md,'utf8'),head=readFileSync(f.json,'utf8'),files=new FileSidecarStore(f.repo),base=createFileJournal(f.repo);let edited=false;
  const edit=()=>{if(!edited){edited=true;appendFileSync(f.md,'\nConcurrent Markdown edit');}};
  const history=new History({readRecords:(file,id)=>files.readRecords(file,id),appendRecord:async(file,record)=>{await files.appendRecord(file,record);if(phase==='append')edit();}});
  const journal={...base,stage:async(id:Parameters<typeof base.stage>[0],op:Parameters<typeof base.stage>[1])=>{await base.stage(id,op);if(phase==='stage')edit();}};
  const store=new ArtifactStore({repoPath:f.repo,history,journal});const service=new LifecycleService({store,evidence:()=>createCompletionEvidence(f.repo)});
  await assert.rejects(operation==='approval'?service.apply(f.id,'approve',actor):publishDesignReview(f.checkpoint,{store}));
  assert.equal(readFileSync(f.json,'utf8'),head);assert.match(readFileSync(f.md,'utf8'),/Concurrent Markdown edit/);
  const pending=await base.pending(f.id);assert.ok(pending!.expectedDocument);
  const restarted=new ArtifactStore({repoPath:f.repo,history:new History(new FileSidecarStore(f.repo)),journal:createFileJournal(f.repo)});
  await assert.rejects(restarted.finishPending(f.id),/document changed|Document changed/i);assert.equal(readFileSync(f.json,'utf8'),head);
  // Only restoring the exact reviewed document permits the already-authorized pending write.
  writeFileSync(f.md,md);await restarted.finishPending(f.id);assert.equal(await base.pending(f.id),undefined);
  assert.equal((await restarted.history.log(f.id)).filter(e=>e.id===pending!.operationId).length,1);
  assert.equal((await restarted.read(f.id)).lifecycle.status,operation==='approval'?'approved':'draft');
 }
});
