// Owned fixture managers self-exit to model a crash; no host daemon is controlled.
import { register } from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { createDevPayloadRepository } from './dev-source-fixture.mjs';
import { createDevManagerPeers } from './dev-manager-peers-fixture.mjs';
const { requireTerminal } = await import('../terminal-admission.ts');
const { devWorkerPaths, readClosedDevFailure, requireClosedDevAttempt } = await import('../dev-worker.ts');
const { runtimeArchive } = await import('../runtime-policy.ts');
const { ControllerStore } = await import('../controller-store.ts');
const { controlBinding } = await import('../native.ts');
const self=fileURLToPath(import.meta.url), worker=fileURLToPath(new URL('./dev-manager-fixture.mjs',import.meta.url));
const admission=()=>requireTerminal({stdin:{isTTY:true},stdout:{isTTY:true},stderr:{isTTY:true}});
const metadata=(home,name)=>join(home,'install/operations/interrupted',`${name}.json`);
if(process.argv[2]==='--owner') {
  const [home,runtimeDirectory,targetJson,point,deliveryJson]=process.argv.slice(3),target=JSON.parse(targetJson),delivery=JSON.parse(deliveryJson);
  const empty=join(home,'empty-worker.mjs');if(point==='missing')writeFileSync(empty,"process.stdin.resume();process.stdin.once('data',()=>process.stdin.destroy());");
  const f=await createDevManagerPeers(home,runtimeDirectory,target,point==='missing'?empty:worker,()=>({...process.env,...(point==='failed'?{INSRC_DEV_PAYLOAD_CASE:'npm'}:{})}));
  const prepare=f.port.prepare.bind(f.port);
  f.port.prepare=(lease,offer,context)=>prepare({...lease,publishCandidate:(...args)=>{const result=lease.publishCandidate(...args);if(point==='published')process.exit(0);return result;}},offer,
    {...context,checkpoint:record=>{context.checkpoint(record);if((point==='prepared'&&record.stage==='prepared')||(point==='failed'&&record.stage==='failed'))process.exit(0);}});
  const manager=f.manager(),current=manager.inspect();let result;
  if(current.kind==='present'&&current.snapshot.installation.activeReleaseId){const shown=await manager.checkUpgrade();result=await manager.execute({protocolVersion:1,installationId:'fixture',operationId:'interrupted',action:'upgrade',acceptedOfferId:shown.offerId});}
  else result=await manager.install(admission(),'interrupted',delivery);
  assert.equal(point,'missing');assert.equal(result.state.phase,'blocked');assert.equal(result.state.errorCode,'preparation-uncertain');
} else {
  const [parent,runtimeDirectory,scenario]=process.argv.slice(2),root=join(parent,{prepared:'a',failed:'b',unknown:'c',published:'d',cancel:'e'}[scenario]);mkdirSync(root);
  const base=createRun(root,{mode:'build'}),run={...base,environment:()=>({...base.environment(),INSRC_BUILD_CONFIRM_CLOSURE:'1'})};
  const target={os:process.platform,arch:process.arch,baseline:'fixture'},runtime={version:'22.22.1',target,sha256:runtimeArchive(target).sha256,relativeExecutable:process.platform==='win32'?'node.exe':'bin/node'};
  await withRun(run,async scope=>{
    const repository=join(root,'r'),{git,delivery}=await createDevPayloadRepository(run,scope,repository,target,runtime);
    async function advance(n){writeFileSync(join(repository,'src/main.ts'),`export const source = ${n};\n`);await git(['commit','--quiet','-am',`advance ${n}`],repository);}
    const home=join(root,'h');mkdirSync(home);
    const owned=async point=>{const result=await scope.start(process.execPath,[self,'--owner',home,runtimeDirectory,JSON.stringify(target),point,JSON.stringify(delivery)]);assert.equal(result.code,0,readFileSync(result.log,'utf8'));};
    const fresh=async()=>{const f=await createDevManagerPeers(home,runtimeDirectory,target,worker);f.port.resolve=async()=>assert.fail('recovery re-resolved a moving branch');return f;};
    const retry=async f=>f.manager().execute({protocolVersion:1,installationId:'fixture',operationId:'interrupted',action:'retry-migration'});
    const checkpoint=()=>JSON.parse(readFileSync(metadata(home,'dev-preparation'),'utf8'));
    const count=()=>existsSync(join(home,'dev/checkouts'))?readdirSync(join(home,'dev/checkouts')).length:0;
    let publications=0;const publish=ControllerStore.prototype.publishCandidate;
    ControllerStore.prototype.publishCandidate=function(...args){this.assertHeld();publications++;return publish.apply(this,args);};
    try {
      if(scenario==='prepared') {
        await owned('prepared');const record=checkpoint(),before=count();assert.equal(existsSync(metadata(home,'candidate')),false);assert.equal(existsSync(join(home,'releases')),false);
        await advance(2);renameSync(repository,`${repository}-offline`);
        const f=await fresh(),result=await retry(f);assert.equal(result.state.phase,'ready',result.state.message);
        assert.equal(count(),before);assert.equal(publications,1);assert.equal(f.manager().inspect().snapshot.installation.activeReleaseId,record.sourceOffer.releaseId);
        const candidate=await f.port.open(f.location,record.sourceOffer.releaseId);assert.equal(candidate.manifest.sourceCommit,record.sourceOffer.sourceCommit);
        await assert.rejects(retry(f),{code:'phase-conflict'});assert.equal(publications,1);
      } else if(scenario==='failed') {
        const seed=await createDevManagerPeers(home,runtimeDirectory,target,worker),initial=await seed.manager().install(admission(),'initial',delivery);assert.equal(initial.state.phase,'ready');
        const selected=seed.manager().inspect().snapshot.installation.activeReleaseId;await advance(2);await owned('failed');
        const old=checkpoint(),paths=devWorkerPaths(home,old),before=count();assert.equal(old.stage,'failed');
        writeFileSync(join(paths.checkout,'src/main.ts'),'keep my failed checkout edits\n');mkdirSync(paths.stage,{recursive:true});writeFileSync(join(paths.stage,'keep'),'keep staging notes');
        await assert.rejects(requireClosedDevAttempt(home,old,'cleanup'),{code:'preparation-uncertain'});
        assert.equal((await readClosedDevFailure(home,old)).outcome,'failed');await advance(3);
        const f=await fresh(),result=await retry(f);assert.equal(result.state.phase,'ready',result.state.message);assert.equal(count(),before+1);
        const next=checkpoint();assert.notEqual(next.attemptId,old.attemptId);assert.notEqual(next.workerNonce,old.workerNonce);assert.deepEqual(next.sourceOffer,old.sourceOffer);
        assert.equal(readFileSync(join(paths.checkout,'src/main.ts'),'utf8'),'keep my failed checkout edits\n');assert.equal(readFileSync(join(paths.stage,'keep'),'utf8'),'keep staging notes');
        assert.notEqual(f.manager().inspect().snapshot.installation.activeReleaseId,selected);assert.equal(publications,2);
      } else if(scenario==='published') {
        await owned('published');const record=checkpoint(),before=count(),paths=devWorkerPaths(home,record),release=join(home,'releases',record.sourceOffer.releaseId);
        assert.equal(existsSync(release),true);assert.equal(existsSync(paths.stage),false);assert.equal(existsSync(metadata(home,'candidate')),false);
        writeFileSync(join(paths.checkout,'out/daemon/index.js'),'ignored output changed after publication');await advance(2);renameSync(repository,`${repository}-offline`);
        const receipt=join(release,'.dev-release.json'),saved=readFileSync(receipt);writeFileSync(receipt,'{}');
        const first=await fresh(),blocked=await retry(first);assert.equal(blocked.state.phase,'blocked');assert.equal(blocked.state.errorCode,'preparation-uncertain');assert.equal(publications,0);assert.equal(first.state.migrations.length,0);writeFileSync(receipt,saved);
        const f=await fresh(),result=await retry(f);assert.equal(result.state.phase,'ready',result.state.message);assert.equal(publications,0);assert.equal(count(),before);
        assert.equal(JSON.parse(readFileSync(metadata(home,'candidate'),'utf8')).releaseId,record.sourceOffer.releaseId);
      } else if(scenario==='unknown') {
        await owned('prepared');const record=checkpoint(),paths=devWorkerPaths(home,record),before=count(),f=await fresh();
        const resultBytes=readFileSync(paths.result),cleanup=join(paths.workspace,'cleanup.json'),cleanupBytes=readFileSync(cleanup);
        async function blocked(){const result=await retry(f);assert.equal(result.state.phase,'blocked');assert.equal(result.state.errorCode,'preparation-uncertain');assert.equal(count(),before);assert.equal(publications,0);assert.equal(existsSync(metadata(home,'candidate')),false);assert.equal(f.state.migrations.length,0);await assert.rejects(requireClosedDevAttempt(home,record,'cleanup'),{code:'preparation-uncertain'});}
        const held=controlBinding().acquire(paths.lock);try{await blocked();}finally{controlBinding().close(held);}
        const foreign={...JSON.parse(resultBytes),workerNonce:'x'.repeat(32)};writeFileSync(paths.result,JSON.stringify(foreign));await blocked();writeFileSync(paths.result,resultBytes);
        renameSync(cleanup,`${cleanup}.retained`);await blocked();renameSync(`${cleanup}.retained`,cleanup);assert.deepEqual(readFileSync(cleanup),cleanupBytes);
        writeFileSync(join(paths.checkout,'src/main.ts'),'keep changed prepared source');await blocked();assert.equal(readFileSync(join(paths.checkout,'src/main.ts'),'utf8'),'keep changed prepared source');
        // A second installation with no private worker outcome stays uncertain.
        const second=join(root,'j');mkdirSync(second);const missing=await scope.start(process.execPath,[self,'--owner',second,runtimeDirectory,JSON.stringify(target),'missing',JSON.stringify(delivery)]);assert.equal(missing.code,0,readFileSync(missing.log,'utf8'));
        const other=await createDevManagerPeers(second,runtimeDirectory,target,worker);other.port.resolve=async()=>assert.fail('unknown recovery resolved source');
        const refused=await retry(other);assert.equal(refused.state.phase,'blocked');assert.equal(refused.state.errorCode,'preparation-uncertain');assert.equal(existsSync(join(second,'releases')),false);
        await assert.rejects(other.manager().execute({protocolVersion:1,installationId:'fixture',operationId:'new',action:'start'}),{code:'phase-conflict'});
      } else {
        const seed=await createDevManagerPeers(home,runtimeDirectory,target,worker);assert.equal((await seed.manager().install(admission(),'initial',delivery)).state.phase,'ready');
        const prior=seed.manager().inspect().snapshot;await advance(2);
        const f=await createDevManagerPeers(home,runtimeDirectory,target,worker,()=>({...process.env,INSRC_DEV_PAYLOAD_CASE:'hold'}));
        const shown=await f.manager().checkUpgrade(),abort=new AbortController();let record;
        const prepare=f.port.prepare.bind(f.port);f.port.prepare=(lease,offer,context)=>prepare(lease,offer,{...context,checkpoint:value=>{context.checkpoint(value);record=value;}});
        const pending=f.manager().upgradeFromTerminal(admission(),{protocolVersion:1,installationId:'fixture',operationId:'interrupted',action:'upgrade',acceptedOfferId:shown.offerId},undefined,abort.signal);
        const deadline=Date.now()+15_000;while(!record||!existsSync(join(devWorkerPaths(home,record).privateRoot,'held-ready'))){if(Date.now()>deadline){abort.abort();await pending;assert.fail('owned npm actor did not become ready');}await delay(20);}
        abort.abort();const result=await pending;assert.equal(result.state.errorCode,'source-cancelled',result.state.message);
        const snapshot=f.manager().inspect().snapshot;assert.equal(snapshot.operation,undefined);assert.deepEqual(snapshot.lastResult,prior.lastResult);assert.equal(snapshot.installation.activeReleaseId,prior.installation.activeReleaseId);
        assert.equal(checkpoint().stage,'cancelled');assert.equal((await readClosedDevFailure(home,checkpoint())).outcome,'cancelled');assert.equal(f.state.shutdowns.length,0);assert.equal(publications,1);
      }
    } finally {ControllerStore.prototype.publishCandidate=publish;}
  });
}
