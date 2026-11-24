// Real repository/lockfile/build/production closure. Only owning dependency,
// lifecycle and migration ports are fixtures; no daemon or application DB opens.
import { register } from 'tsx/esm/api';register();
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint } from '../../../scripts/package-installer.mjs';
import { createDevManagerPeers } from './dev-manager-peers-fixture.mjs';
const {ownedDevGit}=await import('../dev-git.ts');
const {requireTerminal}=await import('../terminal-admission.ts');
const {readVerifiedDevSourceResult,devWorkerPaths}=await import('../dev-worker.ts');
const {readInstalledReceipt}=await import('../installed-receipt.ts');
const {verifyDevPayload}=await import('../dev-payload.ts');
const {retryCommand}=await import('../installed-launcher.ts');
const [source,root,runtimeDirectory]=process.argv.slice(2),target={os:process.platform,arch:process.arch,baseline:'fixture'};
const binary=`node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform==='win32'?'esbuild.exe':'bin/esbuild'}`;
mkdirSync(dirname(join(root,binary)),{recursive:true});copyFileSync(join(source,binary),join(root,binary));
mkdirSync(join(root,'native'));copyFileSync(join(source,'out/installer/native/control.node'),join(root,'native/control.node'));
const base=createRun(root,{mode:'build'}),run={...base,environment:()=>({...base.environment(),INSRC_BUILD_CONFIRM_CLOSURE:'1'})};
let summary;
const cancellation=new AbortController();
const cancel=()=>cancellation.abort();process.stdin.on('end',cancel);process.stdin.resume();
await withRun(run,async scope=>{
  const git=ownedDevGit(run,scope),head=(await git(['rev-parse','--verify','HEAD'],source)).text.trim(),bare=join(root,'source.git');
  await git(['init','--quiet','--bare',`--object-format=${head.length===64?'sha256':'sha1'}`,bare]);
  await git(['--git-dir',bare,'fetch','--quiet','--depth=1','--no-tags','--no-recurse-submodules',source,`${head}:refs/heads/installer`]);
  const bootstrap=join(root,'bootstrap.mjs');await bundleControlEntrypoint(run,scope,join(source,'src/installer/terminal-entry.ts'),bootstrap,target);
  const home=join(root,'h');mkdirSync(home);const f=await createDevManagerPeers(home,runtimeDirectory,target,bootstrap);
  const delivery={mode:'dev',repository:bare,branch:'installer'},offered=await f.port.resolve(delivery);assert.equal(offered.sourceCommit,head);
  const admission=requireTerminal({stdin:{isTTY:true},stdout:{isTTY:true},stderr:{isTTY:true}});
  const result=await f.manager().install(admission,'native-smoke',delivery,undefined,cancellation.signal);assert.equal(result.state.phase,'ready',result.state.message);
  const record=JSON.parse(readFileSync(join(home,'install/operations/native-smoke/dev-preparation.json'),'utf8'));
  const closure=await readVerifiedDevSourceResult(home,record);assert.equal(closure.outcome,'prepared');assert.deepEqual(record.sourceOffer,offered);
  cancellation.signal.throwIfAborted();
  const candidate=await f.port.open(f.location,offered.releaseId);
  const {receipt,inventory}=await verifyDevPayload(candidate.directory,target,runtimeDirectory);assert.equal(receipt.sourceOffer.sourceCommit,head);
  assert.ok(inventory.files.some(file=>file.path==='node_modules/@insrc/project-memory/dist/index.js'));
  assert.ok(inventory.files.some(file=>file.path==='out/bin/insrc-mcp.js'));assert.equal(inventory.files.some(file=>file.path.startsWith('dev/checkouts/')),false);
  // The real manager has already verified/selects this payload. Avoid repeating
  // the terminal handoff's two full-tree reads here; installed-dev and terminal
  // tests exercise that function. Probe the selected release's actual Node.
  const selected={node:join(candidate.directory,'tools/node',receipt.manifest.runtime.relativeExecutable)};
  assert.equal(result.state.candidateId,candidate.releaseId);
  assert.ok(retryCommand(f.location,target,candidate.releaseId).includes(join(candidate.directory,'bootstrap.mjs')));
  // Re-probe the actual published files independently, keeping the probe lock
  // outside immutable payloads and never opening LMDB/Lance/DuckDB stores.
  const probeLock=join(run.workspace,'native-smoke.lock'),program=`const {createRequire}=require('node:module');const r=createRequire(process.cwd()+'/package.json');if(process.version!=='v22.22.1'||process.platform!==${JSON.stringify(target.os)}||process.arch!==${JSON.stringify(target.arch)})throw Error('runtime identity');for(const name of ['lmdb','@lancedb/lancedb','@duckdb/node-api','tree-sitter','onnxruntime-node','@parcel/watcher']){const api=r(name);if(!api)throw Error('native module missing');}const c=r('./native/control.node'),h=c.acquire(${JSON.stringify(probeLock)});if(!c.held(h))throw Error('native lock');c.close(h);`;
  const probe=await scope.start(selected.node,['-e',program],{cwd:candidate.directory,env:{...process.env,PATH:'',NODE_OPTIONS:'',NODE_PATH:''}});assert.equal(probe.code,0,readFileSync(probe.log,'utf8'));
  const request={protocolVersion:1,installationId:'fixture',operationId:'fresh-inspect',action:'inspect'};
  const inspected=await scope.start(selected.node,[join(candidate.directory,'manager.mjs'),'--home',home,'--installation-id','fixture'],{env:{...process.env,PATH:'',NODE_OPTIONS:'',NODE_PATH:''},ownerChannel:{initial:JSON.stringify(request)+'\n',connect:channel=>{channel.end();}}});
  assert.equal(inspected.code,0,readFileSync(inspected.log,'utf8'));const event=JSON.parse(readFileSync(inspected.log,'utf8').trim().split('\n').at(-1));assert.equal(event.kind,'result');assert.equal(event.state.phase,'ready');
  cancellation.signal.throwIfAborted();
  assert.equal((await readInstalledReceipt(candidate.directory,target)).mode,'dev');
  const paths=devWorkerPaths(home,record),policy=JSON.parse(readFileSync(join(paths.workspace,'dev-build-policy.json'),'utf8'));
  assert.equal(policy.nodeVersion,'22.22.1');assert.equal(policy.npmVersion,'10.9.4');
  summary={kind:'local-dev-native-smoke',mode:'dev',sourceCommit:head,acceptedCommit:receipt.manifest.sourceCommit,releaseId:candidate.releaseId,nodeVersion:process.version,npmVersion:policy.npmVersion,cuda:policy.cuda,files:inventory.files.length,payloadBytes:inventory.files.reduce((total,file)=>total+file.bytes,0),nativeProbe:'passed',freshManagerInspect:'passed',target,qualification:'Local native/fixture evidence only; no VM, Windows, IDE or live migration qualification'};
});
process.stdin.off('end',cancel);process.stdin.destroy();
const cleanup=JSON.parse(readFileSync(join(run.workspace,'cleanup.json'),'utf8'));assert.equal(cleanup.confirmedClosed,true);
writeFileSync(join(root,'result.json'),JSON.stringify({...summary,confirmedClosed:cleanup.confirmedClosed})+'\n');
