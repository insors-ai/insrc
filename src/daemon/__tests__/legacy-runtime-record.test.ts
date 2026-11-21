import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { legacyRuntimeForUpgrade } from '../managed-update-preparation.js';

test('stopped legacy migration retains the recorded prior runtime rather than inheriting the new bootstrap runtime',async()=>{
 const root=await mkdtemp(join(tmpdir(),'insrc-prior-runtime-'));
 try{
  const runtime=join(root,'prior-node'),record=join(root,'daemon-node');await writeFile(runtime,'prior fixture',{mode:0o700});await writeFile(record,runtime+'\n',{mode:0o600});
  const before=await readFile(record);assert.equal(await legacyRuntimeForUpgrade(root),await realpath(runtime));assert.deepEqual(await readFile(record),before);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('unknown malformed or mutable legacy runtime records withhold migration without guessing a global Node',async()=>{
 const root=await mkdtemp(join(tmpdir(),'insrc-prior-runtime-'));
 try{
  const record=join(root,'daemon-node');await assert.rejects(legacyRuntimeForUpgrade(root),/unknown/);
  for(const value of ['relative/node','/one/node\n/two/node']){await writeFile(record,value,{mode:0o600});await assert.rejects(legacyRuntimeForUpgrade(root),/Invalid/);}
  await writeFile(record,process.execPath);await chmod(record,0o666);await assert.rejects(legacyRuntimeForUpgrade(root),/Unsafe/);await rm(record);
  const target=join(root,'external-record');await writeFile(target,process.execPath,{mode:0o600});await symlink(target,record);await assert.rejects(legacyRuntimeForUpgrade(root),/Unsafe/);
 }finally{await rm(root,{recursive:true,force:true});}
});
