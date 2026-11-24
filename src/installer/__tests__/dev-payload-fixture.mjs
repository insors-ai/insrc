// Controlled accepted-checkout packaging fixtures. Real complete collection,
// bundling and all native application probes are the final t9 smoke, not this test.
import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
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
  const git = ownedDevGit(run, scope), repository = join(root, 'source 源'); mkdirSync(repository);
  await git(['init', '--quiet', '--initial-branch=installer'], repository);
  await git(['config', 'user.name', 'fixture'], repository); await git(['config', 'user.email', 'fixture@example.invalid'], repository);
  const pkg = { name: 'dev-payload-fixture', version: '1.0.0', type: 'module', workspaces: ['packages/fixture'], dependencies: { '@insrc/fixture': '*' },
    scripts: { preinstall: 'node scripts/npm-probe.cjs' }, insrcInstaller: { schemaVersion: 1, migrations: [{ id: 'verify', version: '1', module: 'out/hooks/verify.js' }] } };
  file(join(repository, 'package.json'), JSON.stringify(pkg));
  file(join(repository, 'packages/fixture/package.json'), JSON.stringify({ name: '@insrc/fixture', version: '1.0.0', type: 'module', files: ['dist'] }));
  file(join(repository, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: {
    '': { name: pkg.name, version: pkg.version, workspaces: pkg.workspaces, dependencies: pkg.dependencies, hasInstallScript: true },
    'node_modules/@insrc/fixture': { resolved: 'packages/fixture', link: true }, 'packages/fixture': { name: '@insrc/fixture', version: '1.0.0' } } }));
  file(join(repository, '.gitignore'), '.insrc/tmp/\nout/\nnode_modules/\npackages/fixture/dist/\n');
  file(join(repository, 'src/main.ts'), 'export const source = 1;\n');
  for (const name of ['context.mjs', 'process.mjs']) file(join(repository, 'scripts/test-harness', name), readFileSync(`scripts/test-harness/${name}`));
  file(join(repository, 'scripts/test-harness/owner.mjs'), readFileSync('scripts/test-harness/build.mjs'));
  file(join(repository, 'scripts/build-installer-control.mjs'), readFileSync('scripts/build-installer-control.mjs'));
  file(join(repository, 'src/installer/native/control.c'), readFileSync('src/installer/native/control.c'));
  file(join(repository, 'scripts/installer-payload.mjs'), readFileSync('scripts/installer-payload.mjs'));
  file(join(repository, 'scripts/test-harness/build.mjs'), `import {prepareBuild as canonical} from './owner.mjs';export {withWriter} from './owner.mjs';export const prepareBuild=(run,scope,options)=>canonical(run,scope,{...options,stages:[['scripts/build-fixture.mjs']],requiredArtifacts:['out/daemon/index.js','out/installer/native/control.node']});`);
  file(join(repository, 'scripts/npm-probe.cjs'), `const fs=require('node:fs');if(!fs.existsSync('.insrc/tmp/test-harness/active/writer'))throw Error('writer missing');if(process.env.INSRC_DEV_PAYLOAD_CASE==='npm')process.exit(9);if(process.env.INSRC_DEV_PAYLOAD_CASE==='input-drift')fs.appendFileSync('src/main.ts','// altered');`);
  file(join(repository, 'scripts/build-fixture.mjs'), `import {mkdirSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';if(process.env.INSRC_DEV_PAYLOAD_CASE==='build')process.exit(10);for(const name of ['out/daemon/index.js','out/cli/index.js','out/installer/terminal-entry.js','out/installer/manager-entry.js','out/bin/insrc-mcp.js','out/installer/native/control.node','out/assets/runtime.json','out/hooks/verify.js','packages/fixture/dist/index.js']){if(process.env.INSRC_DEV_PAYLOAD_CASE==='missing'&&name==='out/bin/insrc-mcp.js')continue;mkdirSync(dirname(name),{recursive:true});writeFileSync(name,'controlled payload fixture');}`);
  file(join(repository, 'scripts/package-installer.mjs'), `
import {readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';import {dirname,join} from 'node:path';
import {collectTree,productionClosure} from './installer-payload.mjs';
export async function bundleControlEntrypoint(run,scope,entry,output){run.assertOwner();const result=await scope.start(run.runtime.executable,['-e',"require('node:fs').writeFileSync(process.argv[1],'controlled bundled control')",output],{env:run.environment()});if(result.code!==0)throw Error('fixture bundling');}
export function collectProductionPayload(root,runtime){const files=collectTree(root,join(root,'out'),'out');for(const [name,value] of productionClosure(root))files.set(name,value);for(const [name,value] of collectTree(runtime,runtime,'tools/node'))files.set(name,value);files.set('package.json',{bytes:readFileSync(join(root,'package.json')),mode:0o644});if(process.env.INSRC_DEV_PAYLOAD_CASE==='runtime')files.delete('tools/node/include/node/node_api.h');if(process.env.INSRC_DEV_PAYLOAD_CASE==='escape')files.set('../escaped',{bytes:Buffer.from('escape'),mode:0o644});if(process.env.INSRC_DEV_PAYLOAD_CASE==='collision')files.set('out/ASSETS/runtime.json',{bytes:Buffer.from('collision'),mode:0o644});return files;}
export async function probePayload(run,scope,directory,target){const program="if(process.version!=='v22.22.1')process.exit(7);if(process.env.INSRC_DEV_PAYLOAD_CASE==='probe')process.exit(11);";const response=await scope.start(join(directory,'tools/node',target.os==='win32'?'node.exe':'bin/node'),['-e',program],{cwd:directory,env:run.environment()});if(response.code!==0)throw Error('controlled native-probe failure');if(process.env.INSRC_DEV_PAYLOAD_CASE==='tamper')writeFileSync(join(directory,'out/assets/runtime.json'),'changed after inventory');if(process.env.INSRC_DEV_PAYLOAD_CASE==='linked'){rmSync(join(directory,'out/assets/runtime.json'));symlinkSync(join(directory,'out/daemon/index.js'),join(directory,'out/assets/runtime.json'));}}
`);
  await git(['add', '.'], repository); await git(['commit', '--quiet', '-m', 'controlled payload'], repository);
  const delivery = { mode: 'dev', repository, branch: 'installer' }, offer = await resolveDevSource(delivery, target, runtime);
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
    try { result = await executeDevWorker(home, { schemaVersion: 1, kind: 'prepare', checkpoint: record }, {
      environment: { ...process.env, INSRC_DEV_PAYLOAD_CASE: kind, ONNXRUNTIME_NODE_INSTALL_CUDA: '' },
      signal: cancellation.signal, work: createDevPreparationWork(location, record, { runtimeDirectory }) }); }
    finally { clearInterval(timer); }
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
