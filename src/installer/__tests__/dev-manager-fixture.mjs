import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { createDevPayloadRepository } from './dev-source-fixture.mjs';
import {createDevManagerPeers} from './dev-manager-peers-fixture.mjs';
const { DevWorkerInput, executeDevWorker } = await import('../dev-worker.ts');
const { createDevPreparationWork, verifyDevPayload } = await import('../dev-payload.ts');
const { devDelivery } = await import('../dev-delivery.ts');
const { resolveInstallationLocation } = await import('../location.ts');
const { requireTerminal } = await import('../terminal-admission.ts');
const { managerFixture } = await import('./_manager-fixture.ts');
const { ControllerStore } = await import('../controller-store.ts');
const { canonicalJson } = await import('../release-descriptor.ts');
const { runtimeArchive } = await import('../runtime-policy.ts');
const self = fileURLToPath(import.meta.url), privateRuntime = process.platform === 'win32' ? dirname(process.execPath) : dirname(dirname(process.execPath));
const mode = process.argv[2];
if (mode === '--dev-preparation-worker') {
  const channel = new DevWorkerInput(process.stdin);
  try {
    const launch = await channel.launch, record = launch.checkpoint, home = process.argv[3];
    const location = resolveInstallationLocation(record.installationId, { home });
    const predecessor = record.predecessorId ? (await verifyDevPayload(join(home, 'releases', record.predecessorId), record.sourceOffer.target, location)).receipt : undefined;
    await executeDevWorker(home, launch, { environment: process.env, signal: channel.controller.signal,
      work: createDevPreparationWork(location, record, { ...(predecessor ? { predecessor } : {}) }) });
  } catch (error) { process.stderr.write(`${error.code ?? 'worker-error'}: controlled preparation refused\n`); process.exitCode = 2; }
  finally { channel.dispose(); }
} else if (mode === '--readonly') {
  const [home, runtimeDirectory, targetJson, releaseId] = process.argv.slice(3), target = JSON.parse(targetJson), f = await createDevManagerPeers(home, runtimeDirectory, target, self);
  // No source tools or worker entrypoint is available to this new adapter.
  f.peers.dev = devDelivery(target, { workerEntrypoint: join(home, 'missing-worker'), environment: () => ({ PATH: '' }) });
  const candidate = await f.peers.dev.open(f.location, releaseId); await f.peers.dev.verify(candidate, f.location);
  f.state.observation = { state: 'present', identity: { protocolVersion: 1, installationId: 'fixture', instanceId: 'selected', releaseId, state: 'ready' }, endpoint: f.location.daemonEndpoint };
  const result = await f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'readonly-start', action: 'start' });
  assert.equal(result.state.phase, 'ready'); assert.equal(f.state.activations.length, 0); assert.equal(f.state.migrations.length, 0);
} else {
  const [parent, runtimeDirectory, scenario] = process.argv.slice(2), root = join(parent, scenario === 'pinned' ? 'n' : scenario[0]); mkdirSync(root);
  const base = createRun(root, { mode: 'build' }), run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  const target = { os: process.platform, arch: process.arch, baseline: 'fixture' }, runtime = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' };
  await withRun(run, async scope => {
    const repository = join(root, 'repo'), {git, delivery, offer} = await createDevPayloadRepository(run, scope, repository, target, runtime);
    const home = join(root, 'h'); mkdirSync(home); const f = await createDevManagerPeers(home, runtimeDirectory, target, self);
    let publications = 0;
    const publish = ControllerStore.prototype.publishCandidate;
    ControllerStore.prototype.publishCandidate = function(...args) { this.assertHeld(); publications++; return publish.apply(this, args); };
    const admission = requireTerminal({ stdin: {isTTY:true}, stdout: {isTTY:true}, stderr: {isTTY:true} });
    try {
      const originalPrepare = f.port.prepare.bind(f.port);
      f.port.prepare = async (lease, accepted, context) => {
        assert.deepEqual(Object.keys(lease).sort(), ['assertHeld','ensureRuntime','inspect','location','publishCandidate']);
        assert.equal('manifest' in accepted, false); assert.equal('descriptorSha256' in accepted, false);
        const saved = JSON.parse(readFileSync(join(home,'install/operations',context.operationId,'dev-source.json'),'utf8'));
        assert.deepEqual(saved.sourceOffer,accepted); lease.assertHeld();
        return originalPrepare(lease,accepted,context);
      };
      const installed = await f.manager().install(admission, 'initial', delivery); assert.equal(installed.state.phase, 'ready', installed.state.message);
      assert.equal(publications,1); const selected = await f.port.open(f.location,offer.releaseId);
      assert.notEqual(selected.descriptorSha256,offer.sourceSha256); assert.equal(selected.releaseId,offer.releaseId);
      const checkpoint = JSON.parse(readFileSync(join(home,'install/operations/initial/dev-preparation.json'),'utf8'));
      assert.equal(checkpoint.stage,'prepared');assert.equal(checkpoint.sourceOffer.sourceSha256,offer.sourceSha256);
      const candidateRecord = JSON.parse(readFileSync(join(home,'install/operations/initial/candidate.json'),'utf8'));
      assert.equal(candidateRecord.descriptorSha256,selected.descriptorSha256);
      async function advance(text) { writeFileSync(join(repository,'src/main.ts'),`export const source = ${text};\n`);await git(['commit','--quiet','-am',`source ${text}`],repository); }
      if (scenario === 'publish') {
        // Reuse fully verified same-source bytes with a fresh adapter, without
        // another worker, checkpoint or publication under the immutable ID.
        const store=ControllerStore.acquire(f.location), prior=store.inspect().snapshot;
        store.commit({...prior,revision:prior.revision+1,installation:{...prior.installation,operationId:'reuse'},operation:{operationId:'reuse',phase:'preparing',predecessorId:offer.releaseId}},prior.revision);
        const lease={ensureRuntime:(...args)=>store.ensureRuntime(...args),location:store.location,assertHeld:()=>store.assertHeld(),inspect:()=>store.inspect(),publishCandidate:(...args)=>store.publishCandidate(...args)};
        try {
          const fresh=devDelivery(target,{workerEntrypoint:join(home,'missing-worker')});
          const reused=await fresh.prepare(lease,offer,{operationId:'reuse',readCheckpoint:()=>undefined,checkpoint:()=>assert.fail('reuse launched a new attempt')});
          assert.deepEqual(reused,selected); assert.equal(publications,1);
          const current=store.inspect().snapshot;store.commit({...current,revision:current.revision+1,installation:{...current.installation,operationId:undefined},operation:undefined},current.revision);
        } finally {store.close();}
        // A worker that closes without private completion evidence cannot clear
        // an unfinished preparing operation or trigger incumbent shutdown.
        await advance(2);const empty=join(root,'empty.mjs');writeFileSync(empty,"process.stdin.resume();process.stdin.once('data',()=>process.stdin.destroy());");
        f.peers.dev=devDelivery(target,{workerEntrypoint:empty});const proposed=await f.manager().checkUpgrade();
        const blocked=await f.manager().execute({protocolVersion:1,installationId:'fixture',operationId:'uncertain',action:'upgrade',acceptedOfferId:proposed.offerId});
        assert.equal(blocked.state.phase,'blocked');assert.equal(blocked.state.errorCode,'preparation-uncertain');
        assert.equal(f.manager().inspect().snapshot.installation.activeReleaseId,offer.releaseId);assert.equal(f.state.shutdowns.length,0);
        assert.equal(f.manager().inspect().snapshot.lastResult.phase,'ready');assert.equal(publications,1);
        await assert.rejects(f.manager().execute({protocolVersion:1,installationId:'fixture',operationId:'independent',action:'start'}),{code:'phase-conflict'});
      } else if (scenario === 'pinned') {
        await advance(2);const shown=await f.manager().checkUpgrade(), before=readFileSync(join(home,'install/controller.json'),'utf8');
        await advance(3);
        await assert.rejects(f.manager().execute({protocolVersion:1,installationId:'fixture',operationId:'stale',action:'upgrade',acceptedOfferId:shown.offerId}),{code:'offer-stale'});
        assert.equal(readFileSync(join(home,'install/controller.json'),'utf8'),before);assert.equal(existsSync(join(home,'install/operations/stale/intent.json')),false);assert.equal(publications,1);assert.equal(f.state.shutdowns.length,0);
        const refreshed=await f.manager().checkUpgrade(), accepted=await f.port.resolve(delivery);
        const prepare=f.port.prepare.bind(f.port);let moved=false;
        f.port.prepare=async(...args)=>{if(!moved){moved=true;await advance(4);}return prepare(...args);};
        const request={protocolVersion:1,installationId:'fixture',operationId:'upgrade',action:'upgrade',acceptedOfferId:refreshed.offerId};
        const upgraded=await f.manager().execute(request);assert.equal(upgraded.state.phase,'ready',upgraded.state.message);
        const final=await f.port.open(f.location,accepted.releaseId);assert.equal(final.manifest.sourceCommit,accepted.sourceCommit);
        assert.notEqual(final.manifest.sourceCommit,(await git(['rev-parse','HEAD'],repository)).text.trim());
        assert.equal(publications,2);assert.equal(f.state.shutdowns.length,1);assert.equal(f.state.migrations.length,2);
        await f.manager().execute(request);assert.equal(publications,2);assert.equal(f.state.migrations.length,2);
      } else {
        // Installed opening is independent of the source checkout and original
        // adapter cache. Only a future upgrade needs retained-source preflight.
        renameSync(repository,`${repository}-offline`);renameSync(join(home,'dev/checkouts'),join(home,'dev/checkouts-offline'));
        const result=await scope.start(process.execPath,[self,'--readonly',home,runtimeDirectory,JSON.stringify(target),offer.releaseId],{env:{...process.env,PATH:'',NODE_OPTIONS:'',NODE_PATH:''}});
        assert.equal(result.code,0,readFileSync(result.log,'utf8'));assert.equal(publications,1);
        const asset=join(selected.directory,'out/assets/runtime.json');writeFileSync(asset,'changed');
        await f.port.open(f.location,offer.releaseId); // Installed control does not hash app data.
        await assert.rejects(verifyDevPayload(selected.directory,target,f.location));
        writeFileSync(join(selected.directory,'bootstrap.mjs'),'changed control');
        await assert.rejects(f.port.open(f.location,offer.releaseId));
      }
    } finally {ControllerStore.prototype.publishCandidate=publish;}
  });
}
