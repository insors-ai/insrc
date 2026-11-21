import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { assertPackagedRuntimeAssets, packageNodeRuntimeInstaller } from '../node-runtime-assets.mjs';
import { archive, nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

const source=readFileSync(resolve('scripts/insrc-daemon-install.sh'),'utf8');
test('packaged installer embeds exactly the canonical shared runtime assets and detects drift',()=>{
 const packaged=packageNodeRuntimeInstaller(source);
 assertPackagedRuntimeAssets(packaged);
 assertPackagedRuntimeAssets(readFileSync(resolve('vscode-plugin/assets/insrc-daemon-install.sh'),'utf8'));
 assert.match(packaged,/^INSRC_NODE_BOOTSTRAP_SHA256='[a-f0-9]{64}'$/m);
 assert.throws(()=>assertPackagedRuntimeAssets(packaged.replace(/(INSRC_NODE_BOOTSTRAP_B64=')./,'$1!')),/lacks verified/);
 const changed=packaged.replace(/INSRC_NODE_BOOTSTRAP_SHA256='[a-f0-9]{64}'/,"INSRC_NODE_BOOTSTRAP_SHA256='"+'0'.repeat(64)+"'");
 assert.throws(()=>assertPackagedRuntimeAssets(changed),/digest mismatch/);
 assert.throws(()=>packageNodeRuntimeInstaller('without markers'),/markers missing/);
});

test('standalone packaged installer bootstraps official Node without global Node or adjacent files',nativeOptions,()=>{
 const f=ownedSourceFixture('absent');
 try{
  const packaged=packageNodeRuntimeInstaller(source,f.seed);assertPackagedRuntimeAssets(packaged,f.seed);
  const alone=join(f.root,'isolated installer.sh');writeFileSync(alone,packaged,{mode:0o700});
  const freshHome=join(f.root,'fresh-home');mkdirSync(freshHome);
  const env={...f.env,HOME:freshHome};
  const args=['--print-runtime','--runtime-archive',archive];
  const first=spawnSync(alone,args,{cwd:f.root,env,encoding:'utf8',timeout:60000});
  assert.equal(first.status,0,first.stderr);const node=first.stdout.trim();assert.ok(node.startsWith(join(freshHome,'.insrc/runtimes')+'/'));
  const identity=spawnSync(node,['-p','JSON.stringify({version:process.versions.node,exe:process.execPath})'],{env:{...env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8'});
  assert.deepEqual(JSON.parse(identity.stdout),{version:'22.22.1',exe:node});
  // The documented curl | bash execution boundary, with verified offline reuse.
  const pipe=spawnSync('/bin/bash',['-s','--','--print-runtime'],{input:packaged,cwd:f.root,env,encoding:'utf8',timeout:30000});
  assert.equal(pipe.status,0,pipe.stderr);assert.equal(pipe.stdout,first.stdout);
  assert.ok(!readdirSync(f.root).some(name=>name.startsWith('insrc-runtime-assets-')));
  assert.ok(!existsSync(f.fakeTrace));
 }finally{f.clean();}
});
