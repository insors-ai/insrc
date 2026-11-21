import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { childEnvironment } from '../test-harness/context.mjs';
import { packageNodeRuntimeInstaller } from '../node-runtime-assets.mjs';
import { archive, nativeOptions } from './helpers/owned-source-fixture.js';
const { NODE_RUNTIME_POLICY } = await import(new URL('../node-runtime-policy.mjs', import.meta.url).href);

test('verified owned Node runs coordinator ownership interruption and actor-closure controls regardless of the parent runtime', {
 ...nativeOptions, skip: nativeOptions.skip || !NODE_RUNTIME_POLICY.targets[`${process.platform}-${process.arch}`]?.enabled,
},()=>{
 const root=realpathSync(mkdtempSync('/tmp/insrc-owned-coordinator-'));
 try{
  const home=join(root,'home');mkdirSync(home,{mode:0o700});
  const env={...process.env,HOME:home,TMPDIR:root,PATH:'/usr/bin:/bin'};
  delete env.NODE_OPTIONS;delete env.NODE_PATH;
  const installer=packageNodeRuntimeInstaller(readFileSync(resolve('scripts/insrc-daemon-install.sh'),'utf8'));
  const bootstrap=spawnSync('/bin/bash',['-s','--','--print-runtime','--runtime-archive',archive],{input:installer,env,encoding:'utf8',timeout:60000});
  assert.equal(bootstrap.status,0,bootstrap.stderr);const node=bootstrap.stdout.trim();
  const identity=spawnSync(node,['-p','process.versions.node'],{env,encoding:'utf8'});assert.equal(identity.stdout.trim(),'22.22.1');
  // These existing controls create disposable fixture checkouts; they do not
  // acquire a second lease on the canonical checkout or rebuild shared output.
  const controls=spawnSync(node,['--import','tsx','--test','--test-reporter=tap','scripts/__tests__/test-harness-coordinator.test.ts'],{
   cwd:resolve('.'),env:childEnvironment({executable:node},env),encoding:'utf8',timeout:60000,
  });
  assert.equal(controls.status,0,controls.stdout+controls.stderr);
  assert.doesNotMatch(controls.stdout,/^not ok /m);assert.match(controls.stdout,/# fail 0\b/);assert.match(controls.stdout,/# skipped 0\b/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
