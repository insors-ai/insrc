// Controlled accepted-checkout packaging fixtures. Real complete collection,
// bundling and all native application probes are the final t9 smoke, not this test.
import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {createDevPayloadRepository} from './dev-source-fixture.mjs';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { traceFlushes } from './_flush-fixture.mjs';
import { fingerprint } from '../../../scripts/test-harness/build.mjs';
const { createDevPreparationWork, verifyDevPayload } = await import('../dev-payload.ts');
const { executeDevWorker, devWorkerPaths, readVerifiedDevResult } = await import('../dev-worker.ts');
const { resolveDevSource, ownedDevGit } = await import('../dev-git.ts');
const { devPreparationPaths } = await import('../dev.ts');
const { resolveInstallationLocation } = await import('../location.ts');
const { runtimeArchive } = await import('../runtime-policy.ts');
const { canonicalJson, digest } = await import('../release-descriptor.ts');
const [parent, runtimeDirectory, scenario] = process.argv.slice(2), root = join(parent, scenario[0]); mkdirSync(root);
const owner = createRun(root, { mode: 'build' }), run = { ...owner, environment: () => ({ ...owner.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
const target = { os: process.platform, arch: process.arch, baseline: 'controlled-payload' };
const runtime = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' };
const file = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
await withRun(run, async scope => {
  const repository = join(root, 'source 源');
  const {git, delivery, offer} = await createDevPayloadRepository(run, scope, repository, target, runtime);
  let sequence = 0;
  async function build(kind, expected) {
    const home = join(root, `h${sequence++}`); mkdirSync(home);
    file(join(home, 'incumbent/keep'), 'incumbent remains selected and serving');
    const before = fingerprint(join(home, 'incumbent'), ['keep']), location = resolveInstallationLocation('fixture', { home });
    const attemptId = `attempt-${kind}`, operationId = `op-${kind}`;
    const sourceOffer = kind === 'fetch' ? { ...offer, sourceCommit: 'f'.repeat(40) } : offer;
    // A fetch failure must still carry a self-consistent accepted source digest.
    if (kind === 'fetch') { const {createDevSourceOffer}=await import('../dev.ts');Object.assign(sourceOffer,createDevSourceOffer({kind:'dev-source',delivery,sourceCommit:'f'.repeat(40),target,runtime,recipeVersion:'dev-v1'})); }
    const record = { schemaVersion: 1, installationId: location.installationId, operationId, attemptId, workerNonce: 'n'.repeat(32), sourceOffer,
      ...devPreparationPaths(operationId, attemptId), coordinatorRunId: randomUUID(), stage: 'accepted' };
    const paths = devWorkerPaths(home, record);
    if (kind === 'existing') file(join(paths.stage, 'retain'), 'do not overwrite');
    process.env.INSRC_DEV_PAYLOAD_CASE = kind;
    const cancellation = new AbortController();
    const timer = kind === 'cancel' ? setInterval(() => { if (existsSync(paths.stage)) cancellation.abort(); }, 10) : undefined;
    let result;
    const trace=kind==='durability'||kind==='flush-stage'?traceFlushes(event=>kind==='flush-stage'&&event.directory&&event.path===join(paths.stage,'out/assets')):undefined;
    try { result = await executeDevWorker(home, { schemaVersion: 1, kind: 'prepare', checkpoint: record }, {
      environment: { ...process.env, INSRC_DEV_PAYLOAD_CASE: kind, ONNXRUNTIME_NODE_INSTALL_CUDA: '' },
      signal: cancellation.signal, work: createDevPreparationWork(location, record, { runtimeDirectory }) }); }
    finally { clearInterval(timer); trace?.restore(); }
    assert.equal(fingerprint(join(home, 'incumbent'), ['keep']), before);
    assert.equal(existsSync(join(home, 'install/controller.json')), false); assert.equal(existsSync(join(home, 'releases')), false);
    assert.equal(existsSync(join(paths.checkout, '.insrc/tmp/test-harness/active')), false);
    const closure = JSON.parse(readFileSync(paths.closure, 'utf8')); assert.ok(closure.admittedCommands > 0);
    assert.equal(JSON.parse(readFileSync(join(paths.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
    assert.equal(result.outcome, expected === 'cancelled' ? 'cancelled' : expected ? 'failed' : 'prepared', existsSync(paths.diagnostic) ? readFileSync(paths.diagnostic, 'utf8') : 'no diagnostic');
    if (expected && expected !== 'cancelled') assert.equal(JSON.parse(readFileSync(paths.diagnostic, 'utf8')).code, expected, kind);
    if (kind === 'cancel') assert.equal(existsSync(join(paths.stage, '.dev-release.json')), false);
    if (kind !== 'fetch') assert.equal(JSON.parse(readFileSync(join(paths.workspace, 'dev-build-policy.json'), 'utf8')).cuda, '');
    if (kind === 'existing') assert.equal(readFileSync(join(paths.stage, 'retain'), 'utf8'), 'do not overwrite');
    if(kind==='durability') {
      const events=trace.events,resultFlush=events.findIndex(event=>event.path.startsWith(paths.result+'.')&&!event.directory);
      if(process.platform!=='win32')for(const directory of [join(paths.stage,'out/assets'),paths.stage,dirname(paths.stage)])
        assert.ok(events.findIndex(event=>event.path===directory&&event.directory)>=0&&events.findIndex(event=>event.path===directory&&event.directory)<resultFlush,'stage namespace must be durable before result');
    }
    return { location, record, paths, result };
  }
  if (scenario === 'complete') {
    const value = await build('complete'), {paths,record,result}=value;
    assert.deepEqual(await readVerifiedDevResult(value.location.home, record), result);
    const {receipt,inventory}=await verifyDevPayload(paths.stage,target,runtimeDirectory);
    for(const name of ['bootstrap.mjs','manager.mjs','native/control.node','out/assets/runtime.json','node_modules/@insrc/fixture/dist/index.js','out/hooks/verify.js','tools/node/include/node/node_api.h'])assert.ok(inventory.files.some(file=>file.path===name));
    assert.equal(inventory.files.some(file=>file.path.includes('checkouts/')||file.path.startsWith('src/')||file.path.startsWith('.insrc/')),false);
    assert.equal(receipt.inventorySha256,receipt.manifest.payloadSha256);assert.equal(receipt.sourceOffer.sourceSha256,offer.sourceSha256);
    assert.equal(result.inventorySha256,digest(readFileSync(join(paths.stage,'inventory.json'))));
    assert.equal(readFileSync(join(paths.stage,'.dev-release.json'),'utf8'),canonicalJson(receipt));
    assert.equal(receipt.manifest.migrations[0].module,'out/hooks/verify.js');assert.deepEqual(receipt.manifest.compatiblePredecessors,[]);
    const policy=JSON.parse(readFileSync(join(paths.workspace,'dev-build-policy.json'),'utf8'));assert.equal(policy.cuda,'');
    for(const kind of ['missing','runtime','escape','collision','linked','tamper'])await build(kind,kind==='missing'?'candidate-conflict':kind==='runtime'?'runtime-invalid':kind==='escape'||kind==='collision'||kind==='linked'||kind==='tamper'?'archive-unsafe':'source-build-failed');
    await build('cancel','cancelled');
  } else if (scenario === 'failures') {
    for(const kind of ['npm','build','fetch','probe','input-drift'])await build(kind,kind==='fetch'?'source-fetch-failed':'source-build-failed');
  } else if(scenario==='durability') {
    await build('durability');
    if(process.platform!=='win32')await build('flush-stage','source-build-failed');
  } else {
    const {paths,location}=await build('immutable'), expected=JSON.parse(readFileSync(join(paths.stage,'.dev-release.json'),'utf8'));
    mkdirSync(join(location.home,'releases'));const published=join(location.home,'releases',offer.releaseId);renameSync(paths.stage,published);
    const asset=join(published,'out/assets/runtime.json'), original=readFileSync(asset);
    writeFileSync(asset,'tampered');await assert.rejects(verifyDevPayload(published,target,runtimeDirectory,{expectedReceipt:expected}));writeFileSync(asset,original);
    file(join(published,'extra'),'extra');await assert.rejects(verifyDevPayload(published,target,runtimeDirectory,{expectedReceipt:expected}));rmSync(join(published,'extra'));
    rmSync(asset);linkSync(join(published,'out/daemon/index.js'),asset);await assert.rejects(verifyDevPayload(published,target,runtimeDirectory,{expectedReceipt:expected}));rmSync(asset);writeFileSync(asset,original);
    // An existing release ID cannot be adopted as the expected immutable receipt
    // just because its source ID matches; final inventory/descriptor is distinct.
    const foreign={...expected,inventorySha256:'a'.repeat(64),manifest:{...expected.manifest,payloadSha256:'a'.repeat(64)}};
    await assert.rejects(verifyDevPayload(published,target,runtimeDirectory,{expectedReceipt:foreign}),{code:'candidate-conflict'});
    await verifyDevPayload(published,target,runtimeDirectory,{expectedReceipt:expected});
    await build('existing','candidate-conflict');
  }
});
