// Controlled application payload, actual bundled controls/private runtime/native
// binding. Full application collection and native probes remain the t9 smoke.
import { register } from 'tsx/esm/api';register();
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint } from '../../../scripts/package-installer.mjs';
import { collectTree, inventoryFor } from '../../../scripts/installer-payload.mjs';
import { createDevManagerPeers } from './dev-manager-peers-fixture.mjs';
const { createDevSourceOffer, devPreparationPaths, devCandidateFromReceipt }=await import('../dev.ts');
const { devWorkerPaths, readClosedDevFailure }=await import('../dev-worker.ts');
const { verifyDevPayload }=await import('../dev-payload.ts');
const { readInstalledReceipt }=await import('../installed-receipt.ts');
const { productionPeers }=await import('../production-peers.ts');
const { runTerminalInstall }=await import('../terminal-install.ts');
const { launchInstalledTui }=await import('../installed-launcher.ts');
const { ControllerStore }=await import('../controller-store.ts');
const { resolveInstallationLocation }=await import('../location.ts');
const { canonicalJson,digest }=await import('../release-descriptor.ts');
const { devRuntimeFixture }=await import('./_dev-runtime-fixture.ts');
const { runtimeArchive }=await import('../runtime-policy.ts');
const [parent,runtimeDirectory,scenario]=process.argv.slice(2),root=join(parent,scenario[0]);mkdirSync(root);
const target={os:process.platform,arch:process.arch,baseline:'fixture'},runtime={version:'22.22.1',target,sha256:runtimeArchive(target).sha256,relativeExecutable:process.platform==='win32'?'node.exe':'bin/node'};
const binaryRelative=`node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform==='win32'?'esbuild.exe':'bin/esbuild'}`;
mkdirSync(dirname(join(root,binaryRelative)),{recursive:true});copyFileSync(realpathSync(binaryRelative),join(root,binaryRelative));
const base=createRun(root,{mode:'build'}),run={...base,environment:()=>({...base.environment(),INSRC_BUILD_CONFIRM_CLOSURE:'1'})};
await withRun(run,async scope=>{
  const bootstrap=join(root,'bootstrap.mjs'),manager=join(root,'manager.mjs');
  await bundleControlEntrypoint(run,scope,realpathSync('src/installer/terminal-entry.ts'),bootstrap,target);
  await bundleControlEntrypoint(run,scope,realpathSync('src/installer/manager-entry.ts'),manager,target);
  const home=join(root,'h x');mkdirSync(home);const location=resolveInstallationLocation('fixture',{home});
  const rawNative=readFileSync('out/installer/native/control.node');
  const {runtime:canonicalRuntime}=await devRuntimeFixture(home,target);
  function payload(commit,predecessors=[]) {
    const offer=createDevSourceOffer({kind:'dev-source',delivery:{mode:'dev',repository:'/source',branch:'installer'},sourceCommit:commit.repeat(40),target,runtime,recipeVersion:'dev-v2-app-only'});
    const files=new Map(),add=(name,bytes,mode=0o644)=>files.set(name,{bytes:Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),mode});
    add('bootstrap.mjs',readFileSync(bootstrap));add('manager.mjs',readFileSync(manager));add('native/control.node',rawNative,0o755);add('out/installer/native/control.node',rawNative,0o755);
    for(const name of ['out/daemon/index.js','out/bin/insrc-mcp.js','out/installer/terminal-entry.js','out/installer/manager-entry.js'])add(name,'export {};\n');
    add('out/cli/index.js',`import fs from 'node:fs';fs.writeFileSync(process.env.INSRC_HOME+'/tui-started',JSON.stringify({node:process.execPath,version:process.version,home:process.env.INSRC_HOME,id:process.env.INSRC_INSTALLATION_ID,cwd:process.cwd()}));if(fs.existsSync(process.env.INSRC_HOME+'/fail-tui'))process.exitCode=7;`);
    add('out/assets/runtime.json','controlled app asset');add('package.json','{"type":"module"}');
    const inventory={schemaVersion:1,files:inventoryFor(files)},inventoryBytes=canonicalJson(inventory),inventorySha256=digest(inventoryBytes);
    const receipt={schemaVersion:2,mode:'dev',sourceOffer:offer,inventorySha256,checkoutRelativePath:`dev/checkouts/fixture-${commit}`,
      manifest:{schemaVersion:1,releaseId:offer.releaseId,sourceCommit:offer.sourceCommit,target,runtime,payloadSha256:inventorySha256,daemonEntry:'out/daemon/index.js',managerEntry:'manager.mjs',tuiEntry:'out/cli/index.js',protocolVersion:1,compatiblePredecessors:predecessors,migrations:[]}};
    const directory=join(home,'releases',offer.releaseId);mkdirSync(directory,{recursive:true});
    for(const [name,value]of files){const path=join(directory,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value.bytes,{mode:value.mode});}
    writeFileSync(join(directory,'inventory.json'),inventoryBytes);writeFileSync(join(directory,'.dev-release.json'),canonicalJson(receipt));
    return {offer,receipt,candidate:devCandidateFromReceipt(directory,receipt,inventory)};
  }
  const first=payload('a');
  function enrolled(delivery=first.offer.delivery) {
    const store=ControllerStore.acquire(location);try{const prior=store.inspect();store.commit({schemaVersion:1,revision:prior.kind==='present'?prior.snapshot.revision+1:0,
      installation:{schemaVersion:1,installationId:'fixture',dataHome:home,delivery,activeReleaseId:first.offer.releaseId},lastResult:{operationId:'seed',phase:'ready',candidateId:first.offer.releaseId}},prior.kind==='present'?prior.snapshot.revision:null);}finally{store.close();}
  }
  async function request(input,node=canonicalRuntime.node,entry=join(first.candidate.directory,'manager.mjs')) {
    const response=await scope.start(node,[entry,'--home',home,'--installation-id','fixture'],{env:{...process.env,PATH:'',NODE_OPTIONS:'',NODE_PATH:''},ownerChannel:{initial:JSON.stringify(input)+'\n',connect:channel=>{channel.end();}}});
    return {response,text:readFileSync(response.log,'utf8')};
  }
  const inspect={protocolVersion:1,installationId:'fixture',operationId:'inspect',action:'inspect'};
  if(scenario==='handoff') {
    const f=await createDevManagerPeers(home,runtimeDirectory,target,bootstrap);let current=first;
    f.port.resolve=async()=>current.offer;f.port.prepare=async lease=>{lease.assertHeld();return current.candidate;};
    async function terminal(operationId,answers) {
      let output='',closed=false;const ui={streams:{stdin:{isTTY:true},stdout:{isTTY:true},stderr:{isTTY:true}},ask:async()=>{const answer=answers.shift();assert.notEqual(answer,undefined);return answer;},write:text=>{output+=text;},close:()=>{closed=true;}};
      const result=await runTerminalInstall({location,target,peers:f.peers,operationId,ui,launch:async selected=>{
        assert.equal(closed,true);const free=ControllerStore.acquire(location);free.close();assert.equal(selected.node,canonicalRuntime.node);assert.equal(selected.managerEntry,join(current.candidate.directory,'manager.mjs'));
        return launchInstalledTui(selected);
      }});return {result,output};
    }
    const installed=await terminal('initial',['dev','/source','installer','yes']);assert.equal(installed.result.kind,'completed',installed.output);
    const marker=JSON.parse(readFileSync(join(home,'tui-started'),'utf8'));assert.equal(marker.node,canonicalRuntime.node);assert.equal(marker.home,home);assert.equal(marker.cwd,home);assert.equal(marker.id,'fixture');
    current=payload('b',[first.offer.releaseId]);writeFileSync(join(home,'fail-tui'),'yes');const upgraded=await terminal('upgrade',['yes','yes']);
    assert.equal(upgraded.result.kind,'post-install-tui-error');assert.ok(upgraded.output.includes(join(current.candidate.directory,'bootstrap.mjs')));assert.ok(upgraded.output.includes(canonicalRuntime.node));
    const snapshot=f.manager().inspect().snapshot;assert.equal(snapshot.installation.activeReleaseId,current.offer.releaseId);assert.equal(snapshot.installation.delivery.mode,'dev');assert.equal(snapshot.lastResult.phase,'ready');assert.equal(snapshot.operation,undefined);
    const launcher=readFileSync(join(home,'bin',target.os==='win32'?'insrc.ps1':'insrc'),'utf8');assert.ok(launcher.includes(current.offer.releaseId));assert.equal(launcher.includes(first.offer.releaseId),false);
    // Execute the real Retry entry, with only terminal presence simulated.
    // Current production S4/S5 peers are intentionally unavailable: fail closed
    // after runtime binding, without replaying installation or launching a TUI.
    const tty=join(root,'tty-presence.mjs');writeFileSync(tty,"for(const stream of [process.stdin,process.stdout,process.stderr])Object.defineProperty(stream,'isTTY',{value:true});");
    const before=readFileSync(join(home,'install/controller.json'));
    const retryArgs=['--import',tty,join(current.candidate.directory,'bootstrap.mjs'),'--launch-tui','--home',home,'--installation-id','fixture'];
    const retry=await scope.start(canonicalRuntime.node,retryArgs,{env:{...run.environment(),PATH:'',NODE_OPTIONS:'',NODE_PATH:''}});
    assert.notEqual(retry.code,0);assert.match(readFileSync(retry.log,'utf8'),/capability-unavailable/);
    const foreignRetry=await scope.start(process.execPath,retryArgs,{env:{...run.environment(),PATH:'',NODE_OPTIONS:'',NODE_PATH:''}});
    assert.notEqual(foreignRetry.code,0);assert.match(readFileSync(foreignRetry.log,'utf8'),/runtime-invalid/);
    assert.deepEqual(readFileSync(join(home,'install/controller.json')),before);
    assert.equal(existsSync(join(home,'dev/checkouts')),false);
  } else {
    enrolled();const before=readFileSync(join(home,'install/controller.json'),'utf8');
    const checked=await request(inspect);assert.equal(checked.response.code,0,checked.text);assert.equal(JSON.parse(checked.text.trim().split('\n').at(-1)).kind,'result');
    assert.equal(readFileSync(join(home,'install/controller.json'),'utf8'),before);assert.equal(existsSync(join(home,'dev/checkouts')),false);
    const foreign=await request(inspect,process.execPath);assert.notEqual(foreign.response.code,0);assert.match(foreign.text,/runtime-invalid/);
    const realPeers=productionPeers(target,location,canonicalRuntime);assert.ok(realPeers.dev);assert.ok(realPeers.bundle);assert.equal(typeof realPeers.dependencies.inspect,'function');assert.equal(typeof realPeers.dependencies.decide,'function');assert.equal(realPeers.lifecycle,undefined);assert.equal(realPeers.migrations,undefined);
    const unavailable=await request({...inspect,operationId:'start',action:'start'});assert.notEqual(unavailable.response.code,0);assert.match(unavailable.text,/capability-unavailable/);assert.equal(readFileSync(join(home,'install/controller.json'),'utf8'),before);
    if(scenario==='inspect') {
      const candidate=await realPeers.dev.open(location,first.offer.releaseId);await realPeers.dev.verify(candidate,location);
      const wrongRuntime=await request(inspect,process.execPath);assert.notEqual(wrongRuntime.response.code,0);assert.match(wrongRuntime.text,/runtime-invalid/);
      const record={schemaVersion:1,installationId:'fixture',operationId:'private-worker',sourceOffer:createDevSourceOffer({kind:'dev-source',delivery:{mode:'dev',repository:join(root,'missing-source'),branch:'installer'},sourceCommit:'f'.repeat(40),target,runtime,recipeVersion:'dev-v2-app-only'}),attemptId:'private-attempt',workerNonce:'n'.repeat(32),...devPreparationPaths('private-worker','private-attempt'),coordinatorRunId:randomUUID(),stage:'accepted'};
      const workerResult=await scope.start(canonicalRuntime.node,[join(first.candidate.directory,'bootstrap.mjs'),'--dev-preparation-worker',home],{env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},ownerChannel:{initial:canonicalJson({schemaVersion:1,kind:'prepare',checkpoint:record})+'\n',connect:()=>()=>{}}});
      assert.equal(workerResult.code,0,readFileSync(workerResult.log,'utf8'));assert.equal((await readClosedDevFailure(home,record)).outcome,'failed');
      const paths=devWorkerPaths(home,record);assert.equal(JSON.parse(readFileSync(paths.diagnostic,'utf8')).code,'source-dirty');assert.equal(readFileSync(join(home,'install/controller.json'),'utf8'),before);
      const forged=await request({...inspect,action:'install',source:'bootstrap'});assert.notEqual(forged.response.code,0);assert.match(forged.text,/install-terminal-required|schema-invalid/);
    } else {
      const receiptFile=join(first.candidate.directory,'.dev-release.json'),saved=readFileSync(receiptFile);
      writeFileSync(join(first.candidate.directory,'.release.json'),'{}');const both=await request(inspect);assert.notEqual(both.response.code,0);assert.match(both.text,/candidate-conflict/);rmSync(join(first.candidate.directory,'.release.json'));
      writeFileSync(receiptFile,canonicalJson({...first.receipt,schemaVersion:3}));assert.notEqual((await request(inspect)).response.code,0);writeFileSync(receiptFile,saved);
      writeFileSync(receiptFile,canonicalJson({...first.receipt,unexpected:true}));assert.notEqual((await request(inspect)).response.code,0);writeFileSync(receiptFile,saved);
      const wrongTarget={...first.receipt,sourceOffer:{...first.offer,target:{...target,baseline:'other'}}};writeFileSync(receiptFile,canonicalJson(wrongTarget));assert.notEqual((await request(inspect)).response.code,0);writeFileSync(receiptFile,saved);
      const changed=ControllerStore.acquire(location);try{const current=changed.inspect().snapshot;changed.commit({...current,revision:current.revision+1,installation:{...current.installation,activeReleaseId:'other'},lastResult:{operationId:'other',phase:'ready',candidateId:'other'}},current.revision);}finally{changed.close();}
      const wrongSelection=await request(inspect);assert.notEqual(wrongSelection.response.code,0);assert.match(wrongSelection.text,/candidate-conflict/);
      enrolled({mode:'bundle',repository:'insors-ai/insrc',channel:'stable'});const mismatch=await request(inspect);assert.notEqual(mismatch.response.code,0);assert.match(mismatch.text,/candidate-conflict/);
      // Synthetic qualified bundle metadata exercises the legacy mode parser;
      // it is never published or reported as release/native qualification.
      rmSync(receiptFile);const missing=await request(inspect);assert.notEqual(missing.response.code,0);assert.match(missing.text,/candidate-conflict/);
      const descriptor={schemaVersion:2,publication:'qualified',manifest:{...first.receipt.manifest,payloadSha256:'d'.repeat(64)},inventorySha256:first.receipt.inventorySha256,
        payload:{url:'https://fixture.invalid/payload.zip',bytes:1,sha256:'d'.repeat(64)},bootstrap:{url:'https://fixture.invalid/bootstrap.mjs',bytes:readFileSync(bootstrap).length,sha256:digest(readFileSync(bootstrap))},native:{url:'https://fixture.invalid/control.node',bytes:rawNative.length,sha256:digest(rawNative)}};
      writeFileSync(join(first.candidate.directory,'.release.json'),canonicalJson(descriptor));assert.equal((await readInstalledReceipt(first.candidate.directory,target)).mode,'bundle');const bundle=await request(inspect);assert.equal(bundle.response.code,0,bundle.text);
      writeFileSync(join(first.candidate.directory,'.release.json'),canonicalJson({...descriptor,schemaVersion:1,runtimeArchive:{path:'runtime/node.tar.gz',bytes:1,sha256:runtime.sha256}}));
      const legacy=await request(inspect);assert.notEqual(legacy.response.code,0);assert.match(legacy.text,/Legacy embedded-runtime/);
      writeFileSync(join(first.candidate.directory,'.release.json'),canonicalJson({...descriptor,publication:'fixture'}));assert.notEqual((await request(inspect)).response.code,0);
      // The same helper remains the real development build CLI when executed
      // at its source path; rebasing it into controls must only disable that entry.
      const cli=join(root,'cli');mkdirSync(join(cli,'scripts/test-harness'),{recursive:true});
      for(const name of ['build.mjs','context.mjs','process.mjs'])copyFileSync(`scripts/test-harness/${name}`,join(cli,'scripts/test-harness',name));
      const direct=await scope.start(process.execPath,[join(cli,'scripts/test-harness/build.mjs')],{env:{...process.env,INSRC_TEST_RUN_ID:undefined,INSRC_TEST_ROOT:undefined,NODE_OPTIONS:'',NODE_PATH:''}});
      assert.notEqual(direct.code,0);assert.match(readFileSync(direct.log,'utf8'),/harness-build-failed/);assert.equal(existsSync(join(cli,'.insrc/tmp/test-harness/active')),false);assert.equal(existsSync(join(cli,'.insrc/tmp/test-harness/runs')),true);
    }
  }
});
