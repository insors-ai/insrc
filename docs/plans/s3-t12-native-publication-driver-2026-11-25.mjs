import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const native=createRequire(import.meta.url)('./native/control-t12.node');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'insrc-t12-native-'));
fs.chmodSync(root,0o700);
let handle,child,childClosed;
try {
  handle=native.acquire(path.join(root,'actor.lock'));
  const from=path.join(root,'candidate'),to=path.join(root,'published');
  const fd=fs.openSync(from,'wx',0o600);fs.writeFileSync(fd,'first');fs.fsyncSync(fd);fs.closeSync(fd);
  native.publishDirectory(handle,from,to);assert.equal(fs.readFileSync(to,'utf8'),'first');assert.equal(fs.existsSync(from),false);
  fs.writeFileSync(from,'second',{mode:0o600});assert.throws(()=>native.publishDirectory(handle,from,to),{code:'candidate-exists'});
  assert.equal(fs.readFileSync(to,'utf8'),'first');assert.equal(fs.readFileSync(from,'utf8'),'second');
  child=spawn(process.execPath,['--input-type=module','-e','process.on("disconnect",()=>process.exit(0));process.on("message",()=>process.disconnect());process.send("ready");'],{stdio:['ignore','ignore','inherit','ipc']});
  childClosed=once(child,'close');await once(child,'message');native.close(handle);handle=undefined;
  handle=native.acquire(path.join(root,'actor.lock'));assert.equal(child.exitCode,null);assert.equal(child.connected,true);
  native.close(handle);handle=undefined;child.send('close');assert.deepEqual(await childClosed,[0,null]);
  const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  console.log(JSON.stringify({scope:'native regular-file publication and non-inherited lock only',platform:process.platform,arch:process.arch,machine:os.machine(),uid:process.getuid(),node:process.version,glibc:process.report.getReport().header.glibcVersionRuntime,sourceSha256:sha(new URL('./native/control.c',import.meta.url)),binarySha256:sha(new URL('./native/control-t12.node',import.meta.url)),checks:{regularFilePublication:true,noReplace:true,execDoesNotInheritLock:true,childClosed:true},temporaryRoot:root},null,2));
} finally {if(handle)native.close(handle);if(child?.connected)child.send('close');if(childClosed)await childClosed;fs.rmSync(root,{recursive:true,force:true});}
