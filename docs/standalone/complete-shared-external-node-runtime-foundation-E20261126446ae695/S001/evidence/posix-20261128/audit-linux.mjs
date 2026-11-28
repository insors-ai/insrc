import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const source='/home/insrctest/insrc-foundation-source-f86ece9c7/checkout',ops='/home/insrctest/insrc-foundation-posix-ops-20261128-r2',root='/home/insrctest/iq-vhi0Vc';
const raw=p=>fs.readFileSync(p,'utf8'),read=p=>JSON.parse(raw(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rows=p=>fs.existsSync(p)?raw(p).split('\n').filter(Boolean).map(JSON.parse):[];
const report=read(root+'/result.json'),complete=read(ops+'/complete.json');
assert.equal(complete.status,'pass');assert.equal(report.status,'pass');assert.equal(report.confirmedClosed,true);
assert.equal(report.sourceCommit,'0938af2dcbc631960d64946fa3cd6a446b3aafef');assert.equal(complete.sourceCommit,report.sourceCommit);
assert.equal(report.target.os,'linux');assert.equal(report.target.arch,'arm64');assert.equal(report.profile,'slow-vm');assert.equal(report.releaseEnablement,false);
const {QUALIFICATION_TIME_BUDGETS:policy}=await import(pathToFileURL(source+'/src/installer/qualification-time-budgets.mjs'));
assert.deepEqual(report.timeBudgets,policy);assert.deepEqual(complete.timeBudgets,policy);
const {privateRuntimeIdentity,runtimeProfile}=await import(pathToFileURL(source+'/out/installer/runtime-policy.js'));
assert.deepEqual(report.runtime.identity,privateRuntimeIdentity(report.target));
assert.equal(report.runtime.inventorySha256,runtimeProfile(report.target).inventorySha256);
assert.equal(complete.inputFingerprint,'d4b23c32ef648cd1974e4a7ffbd8be4a6c5498965c50403c57b0c6b2ca7f0dec');
assert.equal(report.runtime.liveFirstAcquisition,true);assert.equal(report.runtime.offlineNetworkRequests,0);assert.equal(report.runtime.sameExecutableInode,true);
assert.equal(report.runtime.npmVersion,'10.9.4');assert.equal(report.runtime.publicationOutsideRunningNodeAndLoadedControl,true);
assert.equal(report.application.daemonActivationTested,false);assert.equal(report.application.ollamaInstalledOrStarted,false);
const checkpoint=read(root+'/h/install/operations/native-preparation/dev-preparation.json');assert.equal(checkpoint.stage,'prepared');
assert.match(checkpoint.attemptId,/^[a-f0-9-]{36}$/);assert.equal(checkpoint.checkoutRelativePath,`dev/checkouts/${checkpoint.attemptId}`);
const {devWorkerPaths}=await import(pathToFileURL(source+'/out/installer/dev-worker.js'));
const paths=devWorkerPaths(root+'/h',checkpoint);
function auditRun(base,runId,active){
 const cleanup=read(base+'/cleanup.json');assert.equal(cleanup.confirmedClosed,true);assert.equal(cleanup.closureMode,'owned-groups');assert.equal(cleanup.interrupted,false);
 assert.deepEqual(cleanup.evidenceErrors,[]);assert.deepEqual(cleanup.cancellationErrors,[]);assert.equal(fs.existsSync(active),false);
 assert.deepEqual(fs.readdirSync(base+'/actors'),[]);
 const admissions=rows(base+'/child-admissions.jsonl'),closes=rows(base+'/child-results.jsonl'),disposals=rows(base+'/child-disposals.jsonl');
 assert.ok(admissions.length>0);const ids=new Set();
 for(const a of admissions){assert.equal(a.runId,runId);assert.match(a.childId,/^[a-f0-9-]{36}$/);assert.equal(ids.has(a.childId),false);ids.add(a.childId);
  const c=closes.filter(x=>x.childId===a.childId),d=disposals.filter(x=>x.childId===a.childId);assert.equal(c.length,1);assert.equal(d.length,1);
  assert.equal(c[0].runId,runId);assert.equal(d[0].runId,runId);assert.equal(d[0].state,'closed');assert.ok(Number.isFinite(Date.parse(c[0].closedAt)));
  assert.equal(c[0].code,0);assert.equal(c[0].signal,null);assert.equal(c[0].timedOut,false);assert.equal(c[0].launchError,null);
 }
 assert.equal(closes.length,ids.size);assert.equal(disposals.length,ids.size);
 return {runId,admittedCommands:ids.size,confirmedClosed:true,leaseReleased:true,noActors:true,
  cleanupSha256:hash(base+'/cleanup.json'),admissionsSha256:hash(base+'/child-admissions.jsonl'),closesSha256:hash(base+'/child-results.jsonl'),disposalsSha256:hash(base+'/child-disposals.jsonl')};
}
const build=auditRun(complete.buildWorkspace,complete.buildRunId,source+'/.insrc/tmp/test-harness/active');
const parent=auditRun(root+'/.insrc/tmp/test-harness/runs/'+report.runId,report.runId,root+'/.insrc/tmp/test-harness/active');
const worker=auditRun(paths.workspace,checkpoint.coordinatorRunId,paths.active),identity=read(paths.identity),closure=read(paths.closure),result=read(paths.result);
for(const key of ['installationId','operationId','attemptId','workerNonce','coordinatorRunId']){assert.equal(identity[key],checkpoint[key]);assert.equal(closure[key],checkpoint[key]);assert.equal(result[key],checkpoint[key]);}
for(const key of ['cleanupSha256','admissionsSha256','closesSha256','disposalsSha256'])assert.equal(closure[key],worker[key]);
assert.equal(closure.admittedCommands,worker.admittedCommands);assert.equal(closure.commandsSucceeded,true);assert.equal(result.outcome,'prepared');assert.equal(result.cleanupSha256,hash(paths.closure));
const release=root+'/h/releases/'+report.application.releaseId,receipt=read(release+'/.dev-release.json'),inventory=read(release+'/inventory.json');
assert.equal(receipt.sourceOffer.sourceCommit,report.sourceCommit);assert.equal(receipt.manifest.sourceCommit,report.sourceCommit);assert.equal(receipt.schemaVersion,2);
assert.equal(hash(release+'/inventory.json'),receipt.inventorySha256);assert.equal(result.inventorySha256,receipt.inventorySha256);
assert.equal(inventory.files.length,report.application.files);assert.equal(inventory.files.reduce((sum,f)=>sum+f.bytes,0),report.application.payloadBytes);
assert.equal(inventory.files.some(f=>/^(tools\/node|runtime|ollama)\//.test(f.path)),false);
const binding=read(report.runtime.bindingProbeLog),probe=read(report.application.nativeProbeLog);
assert.equal(binding.version,'v22.22.1');assert.equal(probe.version,'v22.22.1');assert.equal(binding.executable,report.runtime.executable);assert.equal(probe.executable,report.runtime.executable);
const manager=raw(report.application.freshManagerLog).trim().split('\n').map(JSON.parse).at(-1);assert.equal(manager.kind,'result');assert.equal(manager.state.phase,'preparing');
const {inputFingerprint,fingerprint}=await import(pathToFileURL(source+'/scripts/test-harness/build.mjs'));
assert.equal(inputFingerprint(source),complete.inputFingerprint);assert.equal(inputFingerprint(paths.checkout),result.inputFingerprint);
assert.equal(result.inputFingerprint,complete.inputFingerprint);
assert.equal(fingerprint(paths.checkout,['out','packages/project-memory/dist']),result.outputFingerprint);
const audit={observedAt:new Date().toISOString(),status:'pass',sourceCommit:report.sourceCommit,profile:report.profile,
 reportSha256:hash(root+'/result.json'),supervisorSha256:hash(ops+'/complete.json'),sourceFingerprint:complete.inputFingerprint,
 build,parent,worker,workerResult:{path:paths.result,sha256:hash(paths.result),outcome:result.outcome,inputFingerprint:result.inputFingerprint,outputFingerprint:result.outputFingerprint},
 receipt:{path:release+'/.dev-release.json',sha256:hash(release+'/.dev-release.json'),inventorySha256:receipt.inventorySha256,files:inventory.files.length,payloadBytes:report.application.payloadBytes},
 runtime:report.runtime,nativeProbe:probe,freshManager:manager,timeBudgets:report.timeBudgets,releaseEnablement:false,
 payloadContentsRehashed:false,payloadIntegrityEvidence:'Actual qualifier verified complete payload inventory before native consumers; audit verifies retained inventory digest and worker/source/output proof without another full payload scan.'};
console.log(JSON.stringify(audit,null,2));
