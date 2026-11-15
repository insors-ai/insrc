import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, symlink, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { productionRoutes } from './helpers/review-production-routes.js';
import { until } from './helpers/review-clearance-fixture.js';
import { routeFixture, ISSUE_ONLY, LLD_ONLY, PLAN_STORY, NO_BUILD, BUILD_ONLY, DEF_STORY } from '../../../workflow/code-review/task-review/__tests__/helpers/route-fixture.js';
import { subjectFixture, other } from '../../../workflow/review/design-review/__tests__/helpers/subject-fixture.js';
import { prepareReviewAdmission } from '../../../workflow/code-review/task-review/admission.js';
import { prepareDesignSubject } from '../../../workflow/review/design-review/subject.js';
import { DESIGN_LIMITS } from '../../../workflow/review/design-review/contracts.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import type { ReviewPacket } from '../../../workflow/code-review/task-review/contracts.js';
import type { LocalPeer } from './helpers/review-clearance-fixture.js';

async function controllerBuilds(f: ReturnType<typeof routeFixture>) {
 await writeFile(join(f.repo, '.insrc/schema.json'), '{"version":2}');
 for (const hash of [ISSUE_ONLY, LLD_ONLY, PLAN_STORY, BUILD_ONLY, DEF_STORY]) {
  const path = join(f.repo, `.insrc/artifacts/BUILD-${hash}-s1.json`), head = JSON.parse(await readFile(path, 'utf8'));
  Object.assign(head.meta, { authoredBy: 'daemon', createdAt: '2026-11-03T00:00:00.000Z', epicCreatedAt: '2026-11-03T00:00:00.000Z', epicSlug: 'route-fixture', standalone: hash !== DEF_STORY });
  head.body.tasks = [{ id: [PLAN_STORY, DEF_STORY].includes(hash) ? 't1' : 's1', passed: true }]; await writeFile(path, JSON.stringify(head));
 }
}

test('production defaults reject missing BUILD mismatched document roles and foreign workflow epic issue and story documents', async t => {
 const f = routeFixture(); t.after(f.cleanup); await controllerBuilds(f);
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer();
 const missing = { repo: f.repo, epicHash: NO_BUILD, reviewId: 'missing-build', attempt: 1, packet: f.packetWith({ issue: f.at(`ISSUE-${NO_BUILD}`) }), timingProtocol: 'activity-v1' };
 await assert.rejects(peer.call('taskReview.start', missing), /BUILD|ENOENT|author/i);
 await assert.rejects(access(reviewWorkerCheckpoint({ project: f.repo, family: 'code', reviewId: missing.reviewId })), { code: 'ENOENT' });
 const cases: { hash: string; documents: ReviewPacket['documents']; error: RegExp }[] = [
  { hash: BUILD_ONLY, documents: { lld: f.at(`LLD-${BUILD_ONLY}-s1`) }, error: /Expected the documents none/ },
  { hash: DEF_STORY, documents: { lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }, error: /Expected the documents story, lld, plan/ },
  { hash: PLAN_STORY, documents: { story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }, error: /Expected the documents lld, plan/ },
  { hash: ISSUE_ONLY, documents: {}, error: /Expected the documents issue/ },
  { hash: LLD_ONLY, documents: { lld: f.at(`LLD-${LLD_ONLY}-s1`), issue: f.at(`ISSUE-${ISSUE_ONLY}`) }, error: /Expected the documents lld/ },
  { hash: PLAN_STORY, documents: { lld: f.at(`LLD-${PLAN_STORY}-s1`) }, error: /Expected the documents lld, plan/ },
 ];
 const wrong = [
  { role: 'lld', hash: LLD_ONLY, patch: { workflow: 'design.epic' }, error: /Expected a design.story artifact/ },
  { role: 'lld', hash: LLD_ONLY, patch: { epicHash: other }, error: /another epic/ },
  { role: 'lld', hash: LLD_ONLY, patch: { storyId: 's2' }, error: /another story/ },
  { role: 'issue', hash: ISSUE_ONLY, patch: { issueHash: other }, error: /another epic/ },
 ] as const;
 for (const [i, item] of wrong.entries()) {
  const original = JSON.parse(await readFile(join(f.repo, `.insrc/artifacts/${item.role === 'lld' ? `LLD-${LLD_ONLY}-s1` : `ISSUE-${ISSUE_ONLY}`}.json`), 'utf8'));
  Object.assign(original.meta, item.patch); const path = `fixtures/foreign-${i}.json`; f.put(path, original); f.git('add', path); f.git('commit', '-qm', 'Foreign document fixture');
  cases.push({ hash: item.hash, documents: { [item.role]: { path, commit: f.git('rev-parse', 'HEAD') } }, error: item.error });
 }
 for (const [i, item] of cases.entries()) {
  const packet = { ...f.packetWith(item.documents), reviewRevision: f.git('rev-parse', 'HEAD') };
  await assert.rejects(prepareReviewAdmission(f.repo, `oracle-negative-${i}`, 1, packet, 'controller', f.sources, { epicHash: item.hash }), item.error);
  const request = { repo: f.repo, epicHash: item.hash, reviewId: `negative-${i}`, attempt: 1, packet, timingProtocol: 'activity-v1' };
  const ack = await peer.call('taskReview.start', request);
  await until(async () => (await peer.call('taskReview.progress', request)).status === 'failed');
  const a = JSON.parse(await readFile(ack.checkpointPath, 'utf8')).attempts.at(-1);
  assert.equal(a.phase, 'admission'); assert.equal(a.validation, 'unverified'); assert.match(a.error.summary, item.error); assert.deepEqual(a.submitted, packet);
  await until(() => !host.host.registry.identity({ project: f.repo, family: 'code', reviewId: request.reviewId }));
 }
});

test('production pinned code scope survives mutable route removal and rejects a changed same-attempt packet', async t => {
 const f = routeFixture(); t.after(f.cleanup); await controllerBuilds(f);
 const host = await productionRoutes(t, [f.repo]), peer = await host.peer(), packet = f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) });
 const request = { repo: f.repo, epicHash: ISSUE_ONLY, reviewId: 'pinned-route', attempt: 1, packet, timingProtocol: 'activity-v1' };
 const ack = await peer.call('taskReview.start', request); let frame: any;
 await until(async () => { frame = await peer.call('taskReview.assignment', request); return frame.kind === 'task'; });
 await assert.rejects(peer.call('taskReview.start', { ...request, packet: { ...packet, functionalSummary: 'Changed pinned input' } }), /pinned|active|conflict|duplicate/i);
 await rm(join(f.repo, `.insrc/artifacts/ISSUE-${ISSUE_ONLY}.json`));
 const done = await peer.call('taskReview.result', { ...request, taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence, result: {
  taskId: 's1', status: 'passed', summary: 'Pinned replacement checked', findings: [], testCoverage: { assessment: 'verified', explanation: 'Selected fixture behavior checked; no submitted tests', evidenceReferences: [`${packet.reviewRevision}:src/a.ts`] }, limitations: [], advice: [], inspectedReferences: [`${packet.reviewRevision}:src/a.ts`], executedTests: [],
 } });
 assert.equal(done.crPublication, 'complete', JSON.stringify(done));
 assert.deepEqual(JSON.parse(await readFile(ack.checkpointPath, 'utf8')).attempts[0].submitted, packet);
});

test('production design defaults reject broken Epic missing seed and orphan issue ancestry before assessment', async t => {
 const broken = subjectFixture(t); broken.put('DEF', { stories: [{ id: 's1' }] }); const epic = broken.put('LLD', { summary: 'Scope' }, { standalone: false, authoredBy: 'daemon' });
 const missing = subjectFixture(t), seed = missing.put('LLD', { summary: 'Scope' }, { standalone: true, authoredBy: 'daemon', seededFromSpec: other });
 const orphan = subjectFixture(t), issue = orphan.put('LLD', { summary: 'Fix' }, { standalone: true, authoredBy: 'daemon', sizeClass: 'bugfix' });
 const cases = [[broken, epic], [missing, seed], [orphan, issue]] as const;
 for (const [f] of cases) await writeFile(join(f.repo, '.insrc/schema.json'), '{"version":2}');
 const host = await productionRoutes(t, cases.map(([f]) => f.repo)), peer = await host.peer();
 for (const [i, [f, target]] of cases.entries()) {
  assert.throws(() => prepareDesignSubject(f.repo, target.json), { code: 'invalid_context' });
  const request = { repo: f.repo, reviewId: `broken-context-${i}`, attempt: 1 };
  const ack = await peer.call('designReview.start', { ...request, artifactPath: target.json });
  await until(async () => (await peer.call('designReview.progress', request)).status === 'failed');
  const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.equal(cp.attempts.at(-1).phase, 'admission'); assert.equal(cp.attempts.at(-1).validation, 'unverified');
  assert.equal(cp.attempts.at(-1).error.code, 'invalid_context');
 }
});

test('production design defaults reject invalid identity containment authors and oversized targets', async t => {
 const outside = await mkdtemp('/tmp/design-untrusted-'); t.after(() => rm(outside, { recursive: true, force: true })); const foreign = join(outside, 'outside.md'); await writeFile(foreign, 'Foreign document');
 const cases: { repo: string; locator: string }[] = [];
 for (const kind of ['marker', 'outside', 'symlink', 'author', 'hash', 'size', 'ISSUE', 'SPEC'] as const) {
  const f = subjectFixture(t), target = f.put(kind === 'ISSUE' || kind === 'SPEC' ? kind : 'LLD', { summary: 'Scope' }, { standalone: true, authoredBy: kind === 'author' ? 'unknown' : 'daemon', ...(kind === 'hash' ? { epicHash: other } : {}) });
  await writeFile(join(f.repo, '.insrc/schema.json'), '{"version":2}'); let locator = target.json;
  if (kind === 'marker') { await writeFile(target.md, `<!-- insrc:artifact DEF-${other} -->`); locator = target.md; }
  if (kind === 'outside') locator = foreign;
  if (kind === 'symlink') { locator = join(f.repo, 'docs', 'escape.md'); await symlink(foreign, locator); }
  if (kind === 'size') await writeFile(target.md, 'x'.repeat(DESIGN_LIMITS.subjectBytes + 1));
  assert.throws(() => prepareDesignSubject(f.repo, locator)); cases.push({ repo: f.repo, locator });
 }
 const host = await productionRoutes(t, cases.map(c => c.repo)), peer = await host.peer();
 for (const [i, c] of cases.entries()) {
  const request = { repo: c.repo, reviewId: `invalid-target-${i}`, attempt: 1 };
  let ack: any; try { ack = await peer.call('designReview.start', { ...request, artifactPath: c.locator }); } catch (error) { assert.match(String(error), /artifact|author|canonical|path|identity|bounded|limit|kind|ENOENT|DEF, HLD or LLD/i); continue; }
  await until(async () => (await peer.call('designReview.progress', request)).status === 'failed');
  const cp = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.equal(cp.attempts.at(-1).phase, 'admission'); assert.equal(cp.attempts.at(-1).validation, 'unverified');
 }
});

test('production design required HLD mutation invalidates the review while unrelated edits do not', async t => {
 const f = subjectFixture(t); f.put('DEF', { stories: [{ id: 's1' }] }); const hld = f.put('HLD'), lld = f.put('LLD', { summary: 'Scope' }, { standalone: false, authoredBy: 'daemon' });
 await writeFile(join(f.repo, '.insrc/schema.json'), '{"version":2}'); const host = await productionRoutes(t, [f.repo]), peer = await host.peer();
 const request = { repo: f.repo, reviewId: 'required-hld', attempt: 1 }; const ack = await peer.call('designReview.start', { ...request, artifactPath: lld.json });
 let assignment:any;await until(async () => {assignment=(await peer.call('designReview.assignment', request)).assignment;return!!assignment;});
 await writeFile(join(f.repo, 'unrelated.txt'), 'Unrelated work');
 const initial=JSON.parse(await readFile(ack.checkpointPath,'utf8')),selectors=initial.attempts[0].inventory.units.map((u:{id:string})=>u.id);
 await peer.call('designReview.plan',{...request,executionId:assignment.executionId,sequence:1,plan:{chunks:[{id:'content',title:'Scope',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units then consistency',finalConsistencyChunkId:'final',coverage:selectors.map((unitId:string)=>({unitId,chunkIds:['content']}))}});
 await until(async()=>{assignment=(await peer.call('designReview.assignment',request)).assignment;return assignment?.kind==='chunk';});
 const before = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.ok(before.attempts[0].plan,'unrelated edits passed an actual phase boundary');
 await writeFile(hld.md, (await readFile(hld.md, 'utf8')) + '\nRequired contract changed\n');
 await until(async () => (await peer.call('designReview.progress', request)).status === 'invalidated');
 assert.equal((await peer.call('designReview.progress', request)).requiresUserInput, true);
 const after = JSON.parse(await readFile(ack.checkpointPath, 'utf8')); assert.deepEqual(after.attempts[0].baseline, before.attempts[0].baseline); assert.deepEqual(after.attempts[0].completedChunks, []);
 await assert.rejects(peer.call('designReview.recover', { ...request, operation: 'restart_full', actionId: 'no-user-decision' }), /restart decision/);
});

async function completeDesign(peer:LocalPeer,repo:string,reviewId:string,attempt:number,target:{json:string;md:string}) {
 const expected=prepareDesignSubject(repo,target.json),request={repo,reviewId,attempt};
 const ack=await peer.call('designReview.start',{...request,artifactPath:target.json});let assignment:any;
 await until(async()=>{assignment=(await peer.call('designReview.assignment',request)).assignment;return!!assignment;});
 const units=expected.inventory.units.map(u=>u.id),plan={chunks:[{id:'content',title:'Scope',selectors:units,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete current scope then consistency',finalConsistencyChunkId:'final',coverage:units.map(unitId=>({unitId,chunkIds:['content']}))};
 if(assignment.kind==='impact'){
  assert.equal(attempt,2);
  await peer.call('designReview.impact',{...request,executionId:assignment.executionId,sequence:1,plan,impact:{baselineAttempt:1,mode:'full',changes:['Document corrected'],directChunkIds:['content'],indirectChunkIds:[],rationale:'Reassess the changed coherent concern',uncertainReason:'No uncertain coverage retained',chunkMapping:[{priorIds:['content'],currentIds:['content'],explanation:'Same concern reassessed'}],retainedCoverage:[],carriedFindingIds:[],consistencyChunkIds:['final']}});
 }else{
  assert.equal(assignment.kind,'planning');
  await peer.call('designReview.plan',{...request,executionId:assignment.executionId,sequence:1,plan});
 }
 for(const chunkId of ['content','final']){
  await until(async()=>{assignment=(await peer.call('designReview.assignment',request)).assignment;return!!assignment;});
  await peer.call('designReview.result',{...request,executionId:assignment.executionId,sequence:1,result:{chunkId,status:'passed',summary:'Complete workflow fixture checked',findings:[],inspectedReferences:[...units,target.json,target.md,ack.checkpointPath,...expected.subject.workflow.requiredReferences.map(r=>r.path)],limitations:[],advice:[],...(attempt>1&&chunkId==='final'?{findingDecisions:[]}:{})}});
 }
 await until(async()=>{const p=await peer.call('designReview.progress',request);if(!['pending','running','passed'].includes(p.status))throw Error(JSON.stringify(p));return p.publication?.state==='complete';});
 return JSON.parse(await readFile(ack.checkpointPath,'utf8'));
}

test('production design correction attempts preserve Epic standalone issue correction links and seed ancestry',async t=>{
 const cases=[];
 for(const kind of ['epic','standalone','issue','seed'] as const){
  const f=subjectFixture(t);
  if(kind==='epic'){f.put('DEF',{stories:[{id:'s1'}]});f.put('HLD');}
  if(kind==='issue')f.put('ISSUE',{fixIntent:'Fix'},{standalone:true,magnitude:'sized',parentRef:{epicHash:other,storyId:'s1'}});
  if(kind==='seed')f.put('SPEC',{intent:'Scope'},{},other);
  const target=f.put('LLD',{summary:'Workflow-specific scope'},{standalone:kind!=='epic',authoredBy:'daemon',...(kind==='issue'?{sizeClass:'bugfix',envelope:{references:[{entityId:`HLD-${other}`,type:'HLD',relation:'corrects'}]}}:{}),...(kind==='seed'?{seededFromSpec:other}:{})});
  const head=JSON.parse(await readFile(target.json,'utf8'));head.meta.lifecycle.status='draft';await writeFile(target.json,JSON.stringify(head));
  await writeFile(join(f.repo,'.insrc/schema.json'),'{"version":2}');cases.push({f,target,kind});
 }
 const host=await productionRoutes(t,cases.map(c=>c.f.repo)),peer=await host.peer();
 for(const {f,target,kind} of cases){
  const first=await completeDesign(peer,f.repo,`correction-${kind}`,1,target);
  await until(()=>!host.host.registry.identity({project:f.repo,family:'design',reviewId:`correction-${kind}`}));
  await writeFile(target.md,(await readFile(target.md,'utf8'))+'\nCorrected document requirement\n');
  const second=await completeDesign(peer,f.repo,`correction-${kind}`,2,target);
  assert.deepEqual(second.attempts[0],first.attempts[0]);assert.equal(second.subject.workflow.kind,kind==='seed'?'standalone':kind);
  assert.deepEqual(second.subject.workflow.requiredReferences.map((r:{role:string})=>r.role),kind==='epic'?['definition','hld']:kind==='issue'?['originating_issue']:kind==='seed'?['seed_spec']:[]);
  assert.notEqual(second.attempts[1].baseline.contentIdentity,first.attempts[0].baseline.contentIdentity);
  await until(()=>!host.host.registry.identity({project:f.repo,family:'design',reviewId:`correction-${kind}`}));
 }
});
