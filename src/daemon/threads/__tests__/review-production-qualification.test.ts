import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, rm, mkdir, chmod, access } from 'node:fs/promises';
import { join } from 'node:path';
import { productionRoutes } from './helpers/review-production-routes.js';
import { until, workerRpc } from './helpers/review-clearance-fixture.js';
import { routeFixture, ISSUE_ONLY, LLD_ONLY, PLAN_STORY, BUILD_ONLY, DEF_STORY } from '../../../workflow/code-review/task-review/__tests__/helpers/route-fixture.js';
import { fixture as codeFixture, hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { prepareReviewAdmission } from '../../../workflow/code-review/task-review/admission.js';
import { contextRoot } from '../../../workflow/review/prepared-context.js';
import { materializePreparedValue, PreparedViewReader } from '../../../workflow/review/prepared-views.js';
import { ReviewMemoryBudget } from '../../../workflow/review/preparation-memory.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import type { PreparedReviewPacket } from '../../../workflow/code-review/task-review/packet.js';
import { subjectFixture } from '../../../workflow/review/design-review/__tests__/helpers/subject-fixture.js';
import { lifecycleFor } from '../../lifecycle-registry.js';
import { nextLifecycle } from '../../../workflow/artifact-core/lifecycle.js';
import { prepareDesignSubject } from '../../../workflow/review/design-review/subject.js';
import { productionFixture } from './helpers/review-production-fixture.js';
import { designFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { reviewRuntimePath } from '../review-runtime-store.js';
import { decodeStoredCheckpoint } from '../../../workflow/code-review/task-review/admission-checkpoint.js';
import { decodeStoredDesignCheckpoint } from '../../../workflow/review/design-review/admission-checkpoint.js';

async function packets(path: string) {
 const cp = JSON.parse(await readFile(path, 'utf8')), key = { project: cp.project, family: 'code' as const, reviewId: cp.reviewId };
 assert.ok(cp.context, `missing prepared context: ${JSON.stringify(cp)}`);
 const manifest = JSON.parse(await readFile(join(contextRoot(key), cp.context.generationId, 'manifest.json'), 'utf8'));
 const limits=reviewPreparationLimits(join(cp.project, 'no-config.json'));
 const reader = await PreparedViewReader.open({ key:manifest.key,attempt:manifest.attempt,generationId:manifest.generationId,identityDigest:manifest.identityDigest,inputDigest:manifest.inputDigest,sourceIdentity:manifest.sourceIdentity,validatorVersion:manifest.validatorVersion,manifestDigest:manifest.manifestDigest,storedBytes:manifest.byteTotals.stored,capacityToken:'inspection-only' }, limits, new ReviewMemoryBudget(limits.memoryMaxBytes), async () => {}, async error => { throw error; });
 const result:PreparedReviewPacket[]=[];
 for(const view of manifest.views as {id:string;kind:string}[])if(view.kind==='packet'){
  const window=await reader.metadata(await reader.descriptor(view.id,'packet'));try{result.push(structuredClone(await materializePreparedValue(reader, window.value)) as PreparedReviewPacket);}finally{window.release();}
 }
 reader.close();return result;
}

test('production defaults preserve all code routes story aliases task selection and complete pinned packet views', async t => {
 const f = routeFixture(); t.after(f.cleanup);
 const routes = [
  { hash: ISSUE_ONLY, documents: { issue: f.at(`ISSUE-${ISSUE_ONLY}`) }, unit: 's1' },
  { hash: LLD_ONLY, documents: { lld: f.at(`LLD-${LLD_ONLY}-s1`) }, unit: 's1' },
  { hash: BUILD_ONLY, documents: {}, unit: 's1' },
  { hash: PLAN_STORY, documents: { lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }, unit: 't1' },
  { hash: DEF_STORY, documents: { story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }, unit: 't1' },
 ];
 for (const route of routes) {
  const path = join(f.repo, `.insrc/artifacts/BUILD-${route.hash}-s1.json`), build = JSON.parse(await readFile(path, 'utf8'));
  Object.assign(build.meta, {authoredBy:'daemon',createdAt:'2026-11-03T00:00:00.000Z',epicCreatedAt:'2026-11-03T00:00:00.000Z',epicSlug:'route-fixture',standalone:route.hash!==DEF_STORY}); build.body.tasks=[{id:route.unit,passed:true}]; await writeFile(path, JSON.stringify(build));
 }
 await writeFile(join(f.repo, '.insrc/schema.json'), JSON.stringify({version:2}));
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(); let n = 0;
 for (const route of routes) for (const storyId of ['s1', `STORY-${route.hash}-s1`]) for (const taskId of [undefined, route.unit]) {
  const packet = { ...f.packetWith(route.documents), storyId, ...(taskId ? { taskId } : {}) };
  const expected = await prepareReviewAdmission(f.repo, `oracle-${n}`, 1, packet, 'controller', f.sources, { epicHash: route.hash });
  const request = { repo: f.repo, epicHash: route.hash, reviewId: `route-${n++}`, attempt: 1, packet, timingProtocol: 'activity-v1' };
  const ack = await peer.call('taskReview.start', request); assert.equal(ack.reviewer, 'controller');
  let frame: any;
  await until(async () => { frame = await peer.call('taskReview.assignment', request); if (frame.kind === 'error') throw Error(JSON.stringify(frame)); return frame.kind === 'scope' || frame.kind === 'task'; });
  const views = await packets(ack.checkpointPath);
  assert.ok(views.some(p => isDeepStrictEqual(p, structuredClone(expected.prepared))), 'production context retains the complete baseline projection, documents, tests and source bytes');
  if (frame.kind === 'scope') frame = await peer.call('taskReview.scope', { ...request, taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence, scope: { tasks: [{ taskId: route.unit, changeIndexes: [0], testIndexes: [] }] } });
  assert.equal(frame.kind, 'task'); assert.equal(frame.taskId, route.unit);
  const done = await peer.call('taskReview.result', { ...request, taskId: route.unit, executionId: frame.executionId, sequence: frame.nextSequence, result: {
   taskId: route.unit, status: 'passed', summary: 'Exact selected FIRST replacement assessed', findings: [],
   testCoverage: { assessment: 'verified', explanation: 'No submitted test cases; selected replacement is the complete fixture behavior', evidenceReferences: [`${packet.reviewRevision}:src/a.ts`] },
   limitations: [], advice: [], inspectedReferences: [`${packet.reviewRevision}:src/a.ts`], executedTests: [],
  } });
  assert.equal(done.crPublication, 'complete', JSON.stringify(done));
 }
});

test('production design defaults preserve DEF HLD epic standalone and issue LLD latest targets and ignore unrelated edits', async t => {
 const epic = subjectFixture(t), standalone = subjectFixture(t), issue = subjectFixture(t), author = { authoredBy: 'daemon' };
 const def = epic.put('DEF', { problem: 'A problem', stories: [{ id: 's1', title: 'Story' }] }, author);
 const hld = epic.put('HLD', { summary: 'Scope' }, author), lld = epic.put('LLD', { summary: 'Story' }, author);
 const root = standalone.put('LLD', { summary: 'Feature scope' }, { ...author, standalone: true });
 issue.put('ISSUE', { reproduction: 'Fails', rootCause: 'Cause', fixIntent: 'Fix' }, { standalone: true, magnitude: 'sized' });
 const fix = issue.put('LLD', { summary: 'Fix scope' }, { ...author, standalone: true, sizeClass: 'bugfix' });
 for (const f of [epic, standalone, issue]) await writeFile(join(f.repo, '.insrc/schema.json'), JSON.stringify({ version: 2 }));
 const host = await productionRoutes(t, [epic.repo, standalone.repo, issue.repo]), peer = await host.peer(); let n = 0;
 for (const [f, target] of [[epic, def], [epic, hld], [epic, lld], [standalone, root], [issue, fix]] as const) for (const locator of [target.json, target.md]) {
  const head=JSON.parse(await readFile(target.json,'utf8'));head.meta.lifecycle.status='draft';await writeFile(target.json,JSON.stringify(head));
  await writeFile(target.md, (await readFile(target.md, 'utf8')) + `\nLatest edit ${n}\n`);
  const expected = prepareDesignSubject(f.repo, locator), request = { repo: f.repo, reviewId: `design-route-${n++}`, attempt: 1 };
  const ack = await peer.call('designReview.start', { ...request, artifactPath: locator }); assert.equal(ack.reviewer, 'controller'); let frame: any;
  await until(async () => { frame = (await peer.call('designReview.assignment', request)).assignment; return !!frame; });
  const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')), attempt = cp.attempts.at(-1);
  assert.deepEqual({ ...attempt.baseline, capturedAt: expected.baseline.capturedAt }, expected.baseline); assert.deepEqual(attempt.inventory, expected.inventory);
  assert.deepEqual(cp.subject.workflow, expected.subject.workflow);
  assert.equal(cp.submitted.artifactPath, locator);
  await writeFile(join(f.repo, 'unrelated.txt'), 'Unrelated external changes must not invalidate the review');
  const selectors = expected.inventory.units.map(u => u.id), plan = {
   chunks: [{ id: 'content', title: 'Scope', selectors, concerns: ['Requirements'], dependsOn: [], purpose: 'substantive' }, { id: 'final', title: 'Consistency', selectors: [], concerns: ['Consistency'], dependsOn: ['content'], purpose: 'consistency' }],
   coverageExplanation: 'Every current unit then whole-artifact consistency', finalConsistencyChunkId: 'final', coverage: selectors.map(unitId => ({ unitId, chunkIds: ['content'] })),
  };
  await peer.call('designReview.plan', { ...request, executionId: frame.executionId, sequence: 1, plan });
  for (const chunkId of ['content', 'final']) {
   await until(async () => { frame = (await peer.call('designReview.assignment', request)).assignment; return !!frame; });
   await peer.call('designReview.result', { ...request, executionId: frame.executionId, sequence: 1, result: { chunkId, status: 'passed', summary: 'Complete current fixture scope inspected', findings: [], inspectedReferences: [...selectors, target.json, target.md, ack.checkpointPath], limitations: [], advice: [] } });
  }
  await until(async () => { const p=await peer.call('designReview.progress',request); if(!['pending','running','passed'].includes(p.status))throw Error(JSON.stringify(p)+'\n'+await readFile(ack.checkpointPath,'utf8')); return p.status==='passed'; });
  await until(() => !host.host.registry.identity({ project: f.repo, family: 'design', reviewId: request.reviewId }));
  const actor={id:'fixture:human',kind:'person' as const,properties:{}};
  await lifecycleFor(f.repo).store.updateAndLog(target.id,actor,head=>({next:{...head,lifecycle:nextLifecycle(head,'approve',actor,new Date().toISOString())},options:{operation:'approve'}}));
 }
});

test('production defaults preserve merge rename deletion witnesses and exact selected spans against the baseline oracle', async t => {
 const f = await codeFixture(); t.after(f.cleanup);
 f.build.meta.authoredBy = 'daemon'; f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, f.build);
 f.put('source.js', 'a\nb\nc\nd\n'); f.put('deleted.js', 'remove me\n'); f.git('add', '.'); f.git('commit', '-qm', 'scope base'); const base = f.git('rev-parse', 'HEAD');
 f.put('source.js', 'a\nB\nc\nd\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected block'); const first = f.git('rev-parse', 'HEAD');
 const branch = f.git('branch', '--show-current'); f.git('checkout', '-qb', 'side'); f.put('unrelated.txt', 'unselected side work'); f.git('add', '.'); f.git('commit', '-qm', 'side');
 f.git('checkout', '-q', branch); f.put('other.txt', 'unselected main work'); f.git('add', '.'); f.git('commit', '-qm', 'main'); f.git('merge', '--no-ff', '-qm', 'merge', 'side');
 const parent = f.git('rev-parse', 'HEAD'); await rename(join(f.repo, 'source.js'), join(f.repo, 'moved.js')); f.put('moved.js', 'a\nB\nC\nd\n'); await rm(join(f.repo, 'deleted.js'));
 f.git('add', '-A'); f.git('commit', '-qm', 'selected rename and deletion'); const pin = f.git('rev-parse', 'HEAD');
 const packet = { ...f.packet, reviewRevision: pin, reviewSet: [
  { commit: first, parent: base, files: [{ path: 'source.js', segments: [{ after: [2, 2] as [number, number] }] }] },
  { commit: pin, parent, files: [{ path: 'moved.js', previousPath: 'source.js', segments: [{ after: [3, 3] as [number, number] }] }, { path: 'deleted.js', segments: [{ deletionAt: 0 }] }] },
 ] };
 const expected = await prepareReviewAdmission(f.repo, 'lineage-oracle', 1, packet, 'controller', f.deps.sources, { epicHash: hash });
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(), request = { repo: f.repo, epicHash: hash, reviewId: 'lineage-production', attempt: 1, packet, timingProtocol: 'activity-v1' };
 const ack = await peer.call('taskReview.start', request);
 await until(async () => (await peer.call('taskReview.assignment', request)).kind === 'task');
 assert.ok((await packets(ack.checkpointPath)).some(p => isDeepStrictEqual(p, structuredClone(expected.prepared))));
 assert.equal(expected.prepared.projection!.entries.length, 3);
 await peer.call('taskReview.cancel', { repo: f.repo, reviewId: request.reviewId, attempt: 1, reason: 'Lineage qualification complete' });
 await until(async()=>(await peer.call('taskReview.progress',request)).operationState==='stopped');
});

for (const recreated of [false, true]) test(`production defaults reject unselected side-branch ${recreated ? 'replacement' : 'deletion'} even when the merge retains selected text`, async t => {
 const f = await codeFixture(); t.after(f.cleanup); f.build.meta.authoredBy = 'daemon'; f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, f.build);
 const branch = f.git('branch', '--show-current'); f.git('checkout', '-qb', 'side'); f.git('rm', '-q', 'source.js'); f.git('commit', '-qm', 'unselected deletion');
 if (recreated) { f.put('source.js', 'export const total = 2;\n'); f.git('add', '.'); f.git('commit', '-qm', 'unselected recreation'); }
 f.git('checkout', '-q', branch); f.put('other.txt', 'main work'); f.git('add', '.'); f.git('commit', '-qm', 'main');
 f.git('merge', '--no-ff', '-s', 'ours', '-qm', 'merge', 'side');
 const packet = { ...f.packet, reviewRevision: f.git('rev-parse', 'HEAD') };
 await assert.rejects(prepareReviewAdmission(f.repo, 'refused-oracle', 1, packet, 'controller', f.deps.sources, { epicHash: hash }), /disappearance or recreation interrupts lineage/);
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(), request = { repo: f.repo, epicHash: hash, reviewId: 'refused-production', attempt: 1, packet, timingProtocol: 'activity-v1' };
 const ack = await peer.call('taskReview.start', request);
 await until(async () => (await peer.call('taskReview.progress', request)).status === 'failed');
 const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')), a = cp.attempts.at(-1);
 assert.equal(a.phase, 'admission'); assert.equal(a.validation, 'unverified'); assert.match(a.error.summary, /disappearance or recreation interrupts lineage/);
 assert.equal(a['review-response']?.tasks?.length ?? 0, 0);
});

test('production design target edits invalidate and only explicit approved restart captures the latest source', async t => {
 const f = designFixture(t, 'daemon'); await writeFile(join(f.repo, '.insrc/schema.json'), '{"version":2}');
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(), request = { repo: f.repo, reviewId: 'target-change', attempt: 1 };
 const ack = await peer.call('designReview.start', { ...request, artifactPath: f.json }); let frame: any;
 await until(async () => { frame = (await peer.call('designReview.assignment', request)).assignment; return !!frame; });
 const before = JSON.parse(await readFile(ack.checkpointPath, 'utf8'));
 await writeFile(f.md, (await readFile(f.md, 'utf8')) + '\nChanged target requirements\n');
 await until(async () => (await peer.call('designReview.progress', request)).status === 'invalidated');
 const invalid = await peer.call('designReview.progress', request); assert.equal(invalid.requiresUserInput, true);
 const restart = { ...request, actionId: 'restart-new-target', operation: 'restart_full' };
 await assert.rejects(peer.call('designReview.recover', restart), /restart decision/);
 const saved = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.equal(saved.attempts.length, 1); assert.deepEqual(saved.attempts[0].baseline, before.attempts[0].baseline);
 await peer.call('designReview.recover', { ...restart, userDecision: { action: 'restart_full', reason: 'Fixture human authorizes latest source', recordedAt: new Date().toISOString() } });
 await until(async () => { frame = (await peer.call('designReview.assignment', { ...request, attempt: 2 })).assignment; return !!frame; });
 const after = JSON.parse(await readFile(ack.checkpointPath, 'utf8'));
 assert.equal(after.attempts.length, 2); assert.deepEqual(after.attempts[0].baseline, before.attempts[0].baseline);
 assert.notEqual(after.attempts[1].baseline.contentIdentity, before.attempts[0].baseline.contentIdentity);
 assert.match(after.attempts[1].baseline.reviewedContent.document, /Changed target requirements/);
 await peer.call('designReview.cancel', { ...request, attempt: 2, reason: 'Restart qualification complete' });
 await until(async()=>(await peer.call('designReview.progress',{...request,attempt:2})).operationState==='stopped');
});

for (const family of ['code', 'design'] as const) test(`production ${family} cold publication rejects edited accepted feedback without another model call`, async t => {
 const f = await productionFixture(t, undefined, { fullStory: true }), peer = await f.peer();
 const initial = family === 'code' ? f.codeRequest('tamper-code') : f.designRequest('tamper-design'), method = family === 'code' ? 'taskReview' : 'designReview';
 const ack = await peer.call(`${method}.start`, initial); await f.release(initial.reviewId);
 await until(async () => { const p = await peer.call(`${method}.progress`, initial); return family === 'code' ? p.crPublication === 'complete' : p.status === 'passed'; });
 await f.host.registry.shutdown();
 const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')), a = cp.attempts.at(-1);
 if (family === 'code') a['review-response'].tasks[0].summary = 'Forged accepted feedback';
 else a.completedChunks[0].summary = 'Forged accepted feedback';
 const previousBarrier=f.barriers.get(initial.reviewId)!, previousCalls=Atomics.load(previousBarrier,family==='code'?5:2);
 const tampered = JSON.stringify(cp); await writeFile(ack.checkpointPath, tampered);
 const request = { repo: initial.repo, reviewId: initial.reviewId, attempt: 1 };
 await assert.rejects(family === 'code' ? peer.call('taskReview.publish', { ...request, epicHash: hash }) : peer.call('designReview.recover', { ...request, actionId: 'retry-tampered-publication', operation: 'retry_publication' }), /[Hh]istory|[Bb]inding|[Cc]heckpoint|[Ff]eedback|[Rr]eport/);
 assert.equal(await readFile(ack.checkpointPath, 'utf8'), tampered, 'rejected tampering is retained for diagnosis');
 const barrier=f.barriers.get(initial.reviewId)!;assert.equal(Atomics.load(barrier,family==='code'?5:2),barrier===previousBarrier?previousCalls:0,'cold failure never dispatches the fixture model');
});

for (const cancelledFamily of ['code', 'design'] as const) test(`production cancellation of an assessing ${cancelledFamily} session leaves the other family owner and feedback untouched`, async t => {
 const code = await codeFixture(); t.after(code.cleanup); code.build.meta.authoredBy = 'daemon'; code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, code.build);
 const design = designFixture(t, 'daemon'); await writeFile(join(design.repo, '.insrc/schema.json'), '{"version":2}');
 const host = await productionRoutes(t, [code.repo, design.repo]), a = await host.peer(), b = await host.peer();
 const requests = {
  code: { repo: code.repo, epicHash: hash, reviewId: 'isolated-code', attempt: 1, packet: code.packet, timingProtocol: 'activity-v1' },
  design: { repo: design.repo, reviewId: 'isolated-design', attempt: 1 },
 };
 const codeAck = await a.call('taskReview.start', requests.code), designAck = await b.call('designReview.start', { ...requests.design, artifactPath: design.json });
 await until(async () => (await a.call('taskReview.assignment', requests.code)).kind === 'task');
 await until(async () => !!(await b.call('designReview.assignment', requests.design)).assignment);
 const otherFamily = cancelledFamily === 'code' ? 'design' : 'code', targetPeer = cancelledFamily === 'code' ? a : b, observer = cancelledFamily === 'code' ? b : a;
 const path = otherFamily === 'code' ? codeAck.checkpointPath : designAck.checkpointPath, before = await readFile(path, 'utf8');
 const otherKey = { project: requests[otherFamily].repo, family: otherFamily, reviewId: requests[otherFamily].reviewId }, owner = host.host.registry.identity(otherKey)!;
 assert.ok(owner); const live=host.workers.filter(w=>w.threadId>0);assert.equal(live.length,2);assert.notEqual(live[0]!.threadId,live[1]!.threadId);
 await targetPeer.call(`${cancelledFamily === 'code' ? 'task' : 'design'}Review.cancel`, { repo: requests[cancelledFamily].repo, reviewId: requests[cancelledFamily].reviewId, attempt: 1, reason: 'Cancel only this fixture session' });
 await until(async () => (await targetPeer.call(`${cancelledFamily === 'code' ? 'task' : 'design'}Review.progress`, requests[cancelledFamily])).operationState === 'stopped');
 assert.equal(await readFile(path, 'utf8'), before); assert.deepEqual(host.host.registry.identity(otherKey), owner);
 const other = await observer.call(`${otherFamily === 'code' ? 'task' : 'design'}Review.assignment`, requests[otherFamily]); assert.ok(other.kind === 'task' || other.assignment);
 await observer.call(`${otherFamily === 'code' ? 'task' : 'design'}Review.cancel`, { repo: otherKey.project, reviewId: otherKey.reviewId, attempt: 1, reason: 'Finish fixture' });
 await until(async()=>(await observer.call(`${otherFamily==='code'?'task':'design'}Review.progress`,requests[otherFamily])).operationState==='stopped');
});

for (const family of ['code', 'design'] as const) test(`production cancellation during ${family} preparation leaves the other session usable and dispatches no target model`, async t => {
 const f = await productionFixture(t), target = await f.peer(), other = await f.peer();
 const request = family === 'code' ? f.codeRequest('cancel-preparing-code') : f.designRequest('cancel-preparing-design'), method = family === 'code' ? 'taskReview' : 'designReview';
 const ack = await target.call(`${method}.start`, request), started = f.started.get(request.reviewId)!;
 await until(async () => family === 'code' ? (await workerRpc(started, 'fixture.stats')).entered : Atomics.load(f.barriers.get(request.reviewId)!, 0) === 1);
 const unrelated = family === 'code' ? f.designRequest('other-during-code') : f.codeRequest('other-during-design'), otherMethod = family === 'code' ? 'designReview' : 'taskReview';
 const otherAck = await other.call(`${otherMethod}.start`, unrelated); await f.release(unrelated.reviewId);
 await until(async () => (await other.call(`${otherMethod}.progress`, unrelated)).status === 'passed');
 const before = await readFile(otherAck.checkpointPath, 'utf8');
 await target.call(`${method}.cancel`, { repo: request.repo, reviewId: request.reviewId, attempt: 1, reason: 'Cancel blocked fixture preparation' });
 await until(async () => (await target.call(`${method}.progress`, request)).operationState === 'stopped');
 assert.equal(started.worker.threadId, -1); assert.equal(Atomics.load(f.barriers.get(request.reviewId)!, family === 'code' ? 5 : 2), 0);
 const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.equal(cp.attempts.at(-1).phase, 'admission');
 assert.equal(await readFile(otherAck.checkpointPath, 'utf8'), before);
 await assert.rejects(target.call(`${method}.${family === 'code' ? 'start' : 'recover'}`, { repo: request.repo, reviewId: request.reviewId, attempt: 1, ...(family === 'code' ? { epicHash: hash, operation: 'resume' } : { operation: 'resume', actionId: 'forbidden-reopen' }) }), /Stopped|stopped|new attempt/);
});

test('production whole-story defaults preserve multi-task dependency order and every submitted test detail', async t => {
 const f = await codeFixture(true, 2); t.after(f.cleanup); f.build.meta.authoredBy = 'daemon'; f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, f.build);
 const expected = await prepareReviewAdmission(f.repo, 'multi-oracle', 1, f.packet, 'controller', f.deps.sources, { epicHash: hash });
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(), request = { repo: f.repo, epicHash: hash, reviewId: 'multi-production', attempt: 1, packet: f.packet, timingProtocol: 'activity-v1' };
 const ack = await peer.call('taskReview.start', request); let frame: any;
 await until(async () => { frame = await peer.call('taskReview.assignment', request); return frame.kind === 'scope'; });
 assert.ok((await packets(ack.checkpointPath)).some(p => isDeepStrictEqual(p, structuredClone(expected.prepared))));
 frame = await peer.call('taskReview.scope', { ...request, taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence, scope: { tasks: ['t1', 't2'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) } });
 for (const taskId of ['t1', 't2']) {
  assert.equal(frame.kind, 'task'); assert.equal(frame.taskId, taskId);
  frame = await peer.call('taskReview.result', { ...request, taskId, executionId: frame.executionId, sequence: frame.nextSequence, result: { ...f.result, taskId } });
 }
 assert.equal(frame.kind, 'done'); assert.equal(frame.crPublication, 'complete', JSON.stringify(frame));
 const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')), a = cp.attempts.at(-1);
 assert.deepEqual(a['review-response'].tasks.map((r: {taskId: string}) => r.taskId), ['t1', 't2']);
 assert.deepEqual(a.submitted.tests, f.packet.tests); assert.deepEqual(a.submitted.reviewSet, f.packet.reviewSet);
});

for (const family of ['code', 'design'] as const) test(`production ${family} publication-only recovery after reclamation preserves feedback without model dispatch`, async t => {
 const f = await productionFixture(t, undefined, { fullStory: true }), peer = await f.peer(), method = family === 'code' ? 'taskReview' : 'designReview';
 const initial = family === 'code' ? f.codeRequest('reclaimed-code') : f.designRequest('reclaimed-design');
 const ack = await peer.call(`${method}.start`, initial); await f.release(initial.reviewId);
 await until(async () => { const p = await peer.call(`${method}.progress`, initial); return family === 'code' ? p.crPublication === 'complete' : p.publication?.state === 'complete'; });
 const before = JSON.parse(await readFile(ack.checkpointPath, 'utf8')).attempts.at(-1);
 await f.host.registry.shutdown();
 const request = { repo: initial.repo, reviewId: initial.reviewId, attempt: 1 };
 if (family === 'design') {
  await assert.rejects(peer.call('designReview.recover', { ...request, actionId: 'forbidden-assessment-resume', operation: 'resume' }), /Completed review|observation-only/);
  await assert.rejects(peer.call('designReview.recover', { ...request, actionId: 'forbidden-reviewer-direction', operation: 'retry_publication', userDecision: { action: 'retry_failed_unit', reason: 'Publication cannot accept reviewer direction', recordedAt: new Date().toISOString() } }), /decision|publication|dispatch/i);
  await peer.call('designReview.recover', { ...request, actionId: 'publication-only-retry', operation: 'retry_publication' });
  await until(async () => { const p = await peer.call('designReview.progress', request); if (p.publication?.error) throw Error(JSON.stringify(p)); return p.publication?.state === 'complete' && p.publication.actions?.some((a: {actionId: string}) => a.actionId === 'publication-only-retry'); });
  await peer.call('designReview.recover', { ...request, actionId: 'publication-only-retry', operation: 'retry_publication' });
 } else assert.equal((await peer.call('taskReview.publish', { ...request, epicHash: hash })).status, 'passed');
 const after = JSON.parse(await readFile(ack.checkpointPath, 'utf8')).attempts.at(-1);
 if (family === 'code') assert.deepEqual(after['review-response'].tasks, before['review-response'].tasks);
 else { assert.deepEqual(after.completedChunks, before.completedChunks); assert.deepEqual(after.report, before.report); }
 assert.equal(Atomics.load(f.barriers.get(initial.reviewId)!, family === 'code' ? 5 : 2), 0);
 const actor = { id: 'fixture:approval', kind: 'person' as const, properties: {} }, project = initial.repo;
 const approvalId = family === 'code' ? `BUILD-${hash}-s1` : f.design.id;
 await lifecycleFor(project).store.updateAndLog(approvalId, actor, head => ({ next: { ...head, lifecycle: nextLifecycle(head, 'approve', actor, new Date().toISOString()) }, options: { operation: 'approve' } }));
 const cleaned = await f.host.registry.cleanupApproved(family === 'code' ? { project, family, epicHash: hash, storyId: 's1' } : { project, family, artifactId: f.design.id });
 assert.deepEqual(cleaned.errors, []); assert.deepEqual(cleaned.retained, []); assert.deepEqual(cleaned.deleted, [ack.checkpointPath]);
});

test('cold production design publication requalifies original evidence and rejects later author edits without a model', async t => {
 const f = await productionFixture(t), peer = await f.peer(), initial = f.designRequest('cold-design-publication');
 const ack = await peer.call('designReview.start', initial); await f.release(initial.reviewId);
 await until(async () => (await peer.call('designReview.progress', initial)).publication?.state === 'complete');
 const before = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); await f.host.shutdown();
 const bin = join(f.design.repo, 'fixture-bin'), marker = join(f.design.repo, 'unexpected-model'); await mkdir(bin);
 for (const command of ['claude', 'codex', 'vibe']) {
  const path = join(bin, command); await writeFile(path, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'Unexpected model dispatch');process.exit(125);`); await chmod(path, 0o755);
 }
 const originalPath = process.env['PATH']; process.env['PATH'] = `${bin}:${originalPath}`; t.after(() => { if (originalPath === undefined) delete process.env['PATH']; else process.env['PATH'] = originalPath; });
 const cold = await productionRoutes(t, [f.design.repo]), caller = await cold.peer(), request = { repo: f.design.repo, reviewId: initial.reviewId, attempt: 1 };
 await caller.call('designReview.recover', { ...request, actionId: 'cold-publication-retry', operation: 'retry_publication' });
 await until(async () => (await caller.call('designReview.progress', request)).publication?.actions?.some((a: {actionId: string}) => a.actionId === 'cold-publication-retry'));
 const after = JSON.parse(await readFile(ack.checkpointPath, 'utf8'));
 assert.notEqual(after.context.generationId, before.context.generationId, 'fresh daemon requalifies instead of trusting an old private receipt');
 assert.deepEqual(after.attempts[0].baseline, before.attempts[0].baseline); assert.deepEqual(after.attempts[0].completedChunks, before.attempts[0].completedChunks);
 await assert.rejects(access(marker), { code: 'ENOENT' });
 await writeFile(f.design.md, (await readFile(f.design.md, 'utf8')) + '\nActual author edit\n');
 await assert.rejects(caller.call('designReview.recover', { ...request, actionId: 'reject-author-edit', operation: 'retry_publication' }), /[Cc]hanged|restart/);
 await assert.rejects(access(marker), { code: 'ENOENT' });
 await cold.host.shutdown();
});

for (const family of ['code', 'design'] as const) for (const version of [1, 2] as const) for (const boundary of ['before-migration', 'after-migration'] as const)
test(`production ${family} v${version} migration survives ${boundary} worker loss and only explicit resubmission activates`, async t => {
 const f = await productionFixture(t, undefined, { migrationCrash: boundary }), peer = await f.peer();
 const reviewId = `migration-${family}-v${version}-${boundary}`, method = family === 'code' ? 'taskReview' : 'designReview';
 const initial = family === 'code' ? f.codeRequest(reviewId) : f.designRequest(reviewId), request = { ...initial, attempt: 2 };
 const key = { project: initial.repo, family, reviewId }, path = reviewWorkerCheckpoint(key);
 const historical: any = family === 'code' ? f.code.checkpoint(reviewId) : { ...structuredClone(f.design.checkpoint), reviewId };
 const a = historical.attempts[0], at = '2026-11-15T00:00:00.000Z'; historical.schemaVersion = version;
 if (family === 'code') {
  a.header.status = 'failed'; a.header.completedAt = at; a['review-response'].tasks = []; a['review-response'].error = 'Historical technical failure';
 } else {
  a.status = 'failed'; a.finishedAt = at; a.failure = { code: 'process_failed', summary: 'Historical technical failure' };
  a.progress = { ...a.progress, status: 'failed', phase: 'complete', requiresUserInput: true, checkpointPath: path };
 }
 if (version === 2) a.resourceGuard = { daemonInstance: 'historical-closed-owner', openLeases: [] };
 (family === 'code' ? decodeStoredCheckpoint : decodeStoredDesignCheckpoint)(historical);
 await mkdir(join(path, '..'), { recursive: true }); const original = JSON.stringify(historical); await writeFile(path, original);
 await assert.rejects(peer.call(`${method}.start`, request), /bootstrap_failed/);
 await until(() => f.createdWorkers.get(reviewId)!.threadId === -1);
 const stopped = JSON.parse(await readFile(reviewRuntimePath(key), 'utf8')), interrupted = JSON.parse(await readFile(path, 'utf8'));
 assert.equal(stopped.state, 'initializing'); assert.equal(stopped.sequence, 0); assert.deepEqual(stopped.resourceGuard.openLeases, []);
 assert.equal(interrupted.attempts.length, 1, 'worker loss cannot invent an admission or feedback');
 if (boundary === 'before-migration') assert.equal(await readFile(path, 'utf8'), original);
 else {
  assert.equal(interrupted.schemaVersion, 3); assert.equal(interrupted.migration.sourceVersion, version);
  assert.equal(interrupted.runtime.runtimeId, stopped.runtimeId);
 }
 assert.equal(f.started.has(reviewId), false, 'a failed migration bootstrap never becomes executable');
 // A fresh observation is read-only. It cannot resume the worker or replace
 // the exact sequence-zero operational proof left by the crash.
 const retained = await readFile(path, 'utf8'); await peer.call(`${method}.progress`, { ...request, attempt: 1 });
 assert.equal(await readFile(path, 'utf8'), retained); assert.equal(f.started.has(reviewId), false);
 await peer.call(`${method}.start`, request); await f.release(reviewId);
 await until(async () => { const p = await peer.call(`${method}.progress`, request); if (p.status === 'failed') throw Error(JSON.stringify(p)); return family === 'code' ? p.crPublication === 'complete' : p.publication?.state === 'complete'; });
 const done = JSON.parse(await readFile(path, 'utf8')), runtime = JSON.parse(await readFile(reviewRuntimePath(key), 'utf8'));
 assert.equal(runtime.runtimeId, stopped.runtimeId); assert.notEqual(runtime.workerIncarnation, stopped.workerIncarnation); assert.equal(runtime.state, 'terminal');
 assert.equal(done.schemaVersion, 3); assert.equal(done.attempts.length, 2); assert.equal(done.migration.sourceVersion, version);
 assert.equal(done.migration.sourceDigest, createHash('sha256').update(original).digest('hex'));
 const { resourceGuard: _guard, ...prior } = historical.attempts[0]; assert.deepEqual(done.attempts[0], prior);
 assert.deepEqual(done.migration.guards, version === 2 ? [{ attempt: 1, guard: a.resourceGuard }] : []);
 if (family === 'code') assert.deepEqual(done.attempts[1].submitted, f.code.packet);
 else assert.deepEqual(done.attempts[1].submitted, { artifactPath: f.design.json, attempt: 2 });
});
