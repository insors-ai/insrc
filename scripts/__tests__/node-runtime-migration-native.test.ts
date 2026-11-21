import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

test('actual owned source staging retains legacy selection on native failure and binds only the ready candidate',nativeOptions,()=>{
 const f=ownedSourceFixture();
 try{
  const git=(cwd:string,...args:string[])=>{
   const r=spawnSync('/usr/bin/git',['-c','user.name=test','-c','user.email=test@example.invalid','-C',cwd,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  writeFileSync(join(f.seed,'.gitignore'),'out/\nnode_modules/\npackages/project-memory/dist/\n');
  // Minimal build fixture tests actual provisioning/npm/binding and failure
  // ordering; representative real native compatibility is qualified in t7.
  writeFileSync(join(f.seed,'observer.mjs'),readFileSync(join(f.seed,'observer.mjs'),'utf8')+`
if(phase==='build'){
 fs.mkdirSync('node_modules',{recursive:true});fs.mkdirSync('out/daemon',{recursive:true});fs.mkdirSync('packages/project-memory/dist',{recursive:true});
 fs.writeFileSync('out/daemon/index.js','process.stdout.write(process.versions.node);');
 fs.writeFileSync('out/bin/insrc-daemon-supervisor.js','process.exit(0);');
 fs.writeFileSync('out/bin/insrc-runtime-smoke.js','process.exit(process.env.INSRC_TEST_SMOKE_FAIL?9:0);');
}
`);
  git(f.seed,'add','.');git(f.seed,'commit','-qm','source staging fixture');const priorCommit=git(f.seed,'rev-parse','HEAD');
  const prior=join(f.root,'prior');git(f.root,'clone','-q','--',f.seed,prior);
  mkdirSync(join(prior,'out/daemon'),{recursive:true});mkdirSync(join(prior,'node_modules'));mkdirSync(join(prior,'packages/project-memory/dist'),{recursive:true});
  writeFileSync(join(prior,'out/daemon/index.js'),'process.stdout.write("retained prior");');
  writeFileSync(join(f.seed,'candidate.txt'),'candidate');git(f.seed,'add','.');git(f.seed,'commit','-qm','candidate');const candidate=git(f.seed,'rev-parse','HEAD');
  const state=join(f.home,'.insrc');mkdirSync(join(state,'managed-lifecycle'),{mode:0o700});
  writeFileSync(join(state,'managed-lifecycle/installation.json'),'retained prior selector',{mode:0o600});
  writeFileSync(join(state,'daemon-node'),process.execPath);
  const worker=join(f.root,'stage.mjs');
  writeFileSync(worker,`import assert from 'node:assert/strict';import fs from 'node:fs';
const {stageManagedRelease,captureManagedReleasePin}=await import(${JSON.stringify(pathToFileURL(resolve('out/daemon/managed-release-staging.js')).href)});
const state=${JSON.stringify(state)},prior=${JSON.stringify(prior)},runtime=${JSON.stringify(process.execPath)};
const profile=releaseId=>({version:1,releaseId,graphSchema:1,startup:'rollback-compatible',formats:{lance:'1',repoAndIndexQueue:'1',config:'1',workflowAndSession:'1'}});
const pin=await captureManagedReleasePin(prior,runtime);const candidate=profile(${JSON.stringify(candidate)});
const source={repoUrl:${JSON.stringify(f.seed)},branch:'main'};
const options={stateRoot:state,runtime,source,prior:{root:prior,runtime},qualification:{source,candidate,pairs:[{prior:profile(${JSON.stringify(priorCommit)}),candidate,priorFingerprint:pin.fingerprint}]}};
process.env.NODE_OPTIONS='--invalid-injection';process.env.NODE_PATH='/external';process.env.INSRC_TEST_SMOKE_FAIL='1';
await assert.rejects(stageManagedRelease(options));
assert.equal(fs.readFileSync(state+'/managed-lifecycle/installation.json','utf8'),'retained prior selector');assert.equal(fs.existsSync(state+'/source-runtimes'),false);
assert.equal((await captureManagedReleasePin(prior,runtime)).fingerprint,pin.fingerprint);
delete process.env.INSRC_TEST_SMOKE_FAIL;
const staged=await stageManagedRelease(options);assert.equal(staged.candidate.runtime,${JSON.stringify(join(f.distribution,'bin/node'))});assert.notEqual(staged.candidate.runtime,runtime);
assert.equal(fs.readFileSync(state+'/daemon-node','utf8'),runtime);assert.equal(fs.readFileSync(state+'/managed-lifecycle/installation.json','utf8'),'retained prior selector');
const records=fs.readdirSync(state+'/source-runtimes').map(name=>JSON.parse(fs.readFileSync(state+'/source-runtimes/'+name)));assert.equal(records.length,1);assert.equal(records[0].installationRoot,staged.candidate.root);assert.equal(records[0].distribution,${JSON.stringify(f.distribution)});
assert.equal((await captureManagedReleasePin(prior,runtime)).fingerprint,pin.fingerprint);
`);
  const r=spawnSync(process.execPath,[worker],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.ok(!existsSync(f.fakeTrace));
  assert.ok(readdirSync(join(state,'source-runtimes')).length===1);
  const probe=spawnSync(join(f.distribution,'bin/node'),[resolve('out/bin/insrc-runtime-smoke.js')],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:30000});
  assert.equal(probe.status,0,probe.stderr);
  const loaded=JSON.parse(probe.stdout.trim().split('\n').at(-1)!);assert.equal(loaded.node,'22.22.1');assert.equal(loaded.executable,join(f.distribution,'bin/node'));assert.equal(loaded.loaded.length,5);

  for(const record of f.records()){assert.equal(record.version,'22.22.1');assert.equal(record.exe,join(f.distribution,'bin/node'));}
 }finally{f.clean();}
});

test('selected source shell and TUI updates refuse in-place mutation and retain the ready binding',nativeOptions,()=>{
 const f=ownedSourceFixture();
 try{
  const state=join(f.home,'.insrc'),node=join(f.distribution,'bin/node');
  const bind=spawnSync(node,[join(f.scripts,'node-runtime-store.mjs'),'bind',state,f.seed,f.distribution],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:30000});assert.equal(bind.status,0,bind.stderr);
  const lock=readFileSync(join(f.seed,'package-lock.json'));
  mkdirSync(join(f.seed,'out/bin'),{recursive:true});writeFileSync(join(f.seed,'out/bin/insrc-daemon-control.js'),'process.exit(10);');
  const shell=spawnSync('/bin/bash',[join(f.scripts,'daemon-ctl.sh'),'update','--skip-sync'],{env:{...f.env,INSRC_DAEMON_ROOT:f.seed},encoding:'utf8',timeout:30000});
  assert.equal(shell.status,4,shell.stdout+shell.stderr);assert.match(shell.stdout,/requires staged migration/);
  // Select the TUI's source adapter rather than macOS's installer bridge.
  rmSync(join(f.scripts,'insrc-daemon-install.sh'));
  const worker=join(f.root,'source-update.mjs');writeFileSync(worker,`const {update}=await import(${JSON.stringify(pathToFileURL(resolve('out/cli/services/maintenance.js')).href)});process.stdout.write(JSON.stringify(await update({skipSync:true},()=>{})));`);
  const cli=spawnSync(process.execPath,[worker],{env:{...f.env,INSRC_DAEMON_ROOT:f.seed,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:30000});assert.equal(cli.status,0,cli.stderr);
  const result=JSON.parse(cli.stdout);assert.equal(result.ok,false);assert.match(result.error,/requires staged migration/);
  assert.deepEqual(readFileSync(join(f.seed,'package-lock.json')),lock);assert.equal(readdirSync(join(state,'source-runtimes')).length,1);assert.ok(!existsSync(f.trace));assert.ok(!existsSync(f.fakeTrace));
 }finally{f.clean();}
});

test('installer refuses an existing non-Darwin source tree before lockfile dependencies or database bytes can change',nativeOptions,()=>{
 const f=ownedSourceFixture();
 try{
  // Platform routing fixture; this is not Linux native qualification.
  const platform=join(f.root,'platform');mkdirSync(platform);writeFileSync(join(platform,'uname'),"#!/bin/sh\nprintf '%s\\n' Linux\n",{mode:0o700});
  const selected=join(f.root,'selected');const clone=spawnSync('/usr/bin/git',['clone','-q','--',f.seed,selected],{encoding:'utf8'});assert.equal(clone.status,0,clone.stderr);
  mkdirSync(join(selected,'node_modules'));writeFileSync(join(selected,'node_modules/retained-native'),'native bytes');
  const state=join(f.home,'.insrc');mkdirSync(join(state,'lance'));writeFileSync(join(state,'lance/retained-data'),'vector data');writeFileSync(join(state,'graph.lmdb'),'graph bytes');
  const lock=join(selected,'package-lock.json');writeFileSync(lock,'retained local lockfile');
  const run=spawnSync('/bin/bash',[join(f.scripts,'insrc-daemon-install.sh'),'--target',selected,'--no-start','-y'],{env:{...f.env,PATH:platform+':/usr/bin:/bin'},encoding:'utf8',timeout:30000});
  assert.equal(run.status,4,run.stdout+run.stderr);assert.match(run.stderr,/requires a staged update/);
  assert.equal(readFileSync(lock,'utf8'),'retained local lockfile');assert.equal(readFileSync(join(selected,'node_modules/retained-native'),'utf8'),'native bytes');assert.equal(readFileSync(join(state,'graph.lmdb'),'utf8'),'graph bytes');assert.equal(readFileSync(join(state,'lance/retained-data'),'utf8'),'vector data');assert.ok(!existsSync(f.trace));
 }finally{f.clean();}
});
