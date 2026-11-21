import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ownedNodeEnvironment, resolveOwnedToolchain } from '../../src/shared/owned-node-runtime.js';
import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

test('native Python imports leave the owned npm distribution byte-for-byte reusable through shell and TUI environments',nativeOptions,async()=>{
 const f=ownedSourceFixture('absent');
 try{
  const library=join(f.distribution,'lib/node_modules/npm/node_modules/node-gyp/gyp/pylib');
  const args=['-c','import sys;sys.path.insert(0,sys.argv[1]);import gyp',library];
  const environment={...f.env,PYTHONDONTWRITEBYTECODE:''};
  const shell=spawnSync('/bin/bash',['-c','. "$1/node-runtime-env.sh"; insrc_source_toolchain "$1" "$2" || exit; /usr/bin/python3 -c \'import sys;sys.path.insert(0,sys.argv[1]);import gyp\' "$3"', 'python-cache-check',f.scripts,join(f.home,'.insrc'),library],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(shell.status,0,shell.stderr);
  const toolchain=await resolveOwnedToolchain(f.seed,join(f.home,'.insrc'));
  const tui=spawnSync('/usr/bin/python3',args,{env:ownedNodeEnvironment(toolchain,environment),encoding:'utf8',timeout:30000});
  assert.equal(tui.status,0,tui.stderr);
  assert.equal(existsSync(join(library,'gyp/__pycache__')),false);
  const reuse=spawnSync('/bin/bash',[join(f.scripts,'provision-node-runtime.sh'),join(f.home,'.insrc')],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(reuse.status,0,reuse.stderr);assert.equal(reuse.stdout.trim(),f.distribution);
  assert.equal(environment.PYTHONDONTWRITEBYTECODE,'');
 }finally{f.clean();}
});


test('shell and TUI npm lifecycle children default ONNX CUDA to skip while retaining explicit environment values',nativeOptions,async()=>{
 const f=ownedSourceFixture('absent');
 try{
  const trace=join(f.root,'cuda.jsonl'),observer=join(f.seed,'observer.mjs');
  writeFileSync(observer,readFileSync(observer,'utf8')+"\nfs.appendFileSync(process.env.INSRC_CUDA_TRACE,JSON.stringify(process.env.ONNXRUNTIME_NODE_INSTALL_CUDA)+'\\n');\n");
  const toolchain=await resolveOwnedToolchain(f.seed,join(f.home,'.insrc'));
  for(const value of [undefined,'v12','']){
   const environment:NodeJS.ProcessEnv={...f.env,INSRC_CUDA_TRACE:trace};
   if(value===undefined)delete environment['ONNXRUNTIME_NODE_INSTALL_CUDA'];else environment['ONNXRUNTIME_NODE_INSTALL_CUDA']=value;
   const shell=spawnSync('/bin/bash',['-c','set -euo pipefail; . "$1/node-runtime-env.sh"; insrc_source_toolchain "$1" "$2"; cd "$3"; "$NODE_BIN" "$NPM_CLI" run build','cuda-default-check',f.scripts,join(f.home,'.insrc'),f.seed],{env:environment,encoding:'utf8',timeout:60000});
   assert.equal(shell.status,0,shell.stdout+shell.stderr);
   const tui=spawnSync(toolchain.node,[toolchain.npm,'run','build'],{cwd:f.seed,env:ownedNodeEnvironment(toolchain,environment),encoding:'utf8',timeout:30000});
   assert.equal(tui.status,0,tui.stdout+tui.stderr);
   const records=readFileSync(trace,'utf8').trim().split('\n').map(line=>JSON.parse(line));
   assert.deepEqual(records.slice(-2),[value??'skip',value??'skip']);
   assert.equal(environment['ONNXRUNTIME_NODE_INSTALL_CUDA'],value);
  }
 }finally{f.clean();}
});
