import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
