import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

const moduleUrl = (file: string) => pathToFileURL(resolve(`out/cli/services/${file}.js`)).href;

test('installed TUI and MCP symlink wrappers use official owned Node under absent and hostile PATH', nativeOptions, () => {
 const f = ownedSourceFixture();
 try {
  const caller = join(f.root, 'caller'); mkdirSync(caller);
  for (const [wrapper, entry] of [['insrc', 'out/cli/index.js'], ['insrc-mcp', 'out/bin/insrc-mcp.js']] as const) {
   mkdirSync(join(f.seed, entry, '..'), {recursive:true});
   writeFileSync(join(f.seed, entry), `process.stdout.write(JSON.stringify({version:process.versions.node,exe:process.execPath,cwd:process.env.INSRC_CWD??process.cwd(),options:process.env.NODE_OPTIONS,path:process.env.NODE_PATH}));`);
   const link = join(caller, wrapper); symlinkSync(join(f.scripts, wrapper), link);
   for (const path of [f.env.PATH, '']) {
    const result = spawnSync('/bin/bash', [link], {cwd:caller, env:{...f.env,PATH:path}, encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {version:'22.22.1',exe:join(f.distribution,'bin/node'),cwd:caller});
   }
  }
  writeFileSync(join(f.distribution, 'LICENSE'), 'corrupt');
  const failed = spawnSync('/bin/bash',[join(f.scripts,'insrc-mcp')],{env:f.env,encoding:'utf8',timeout:30000});
  assert.notEqual(failed.status,0); assert.match(failed.stderr,/integrity|inventory|corrupt|mismatch/i);
  assert.ok(!existsSync(f.fakeTrace));
 } finally { f.clean(); }
});

test('TUI update runs absolute official npm and lifecycle Node with the shared shell marker', nativeOptions, () => {
 const f = ownedSourceFixture();
 try {
  // Exercise the source TUI adapter; macOS's separately tested managed bridge
  // is selected only when an installer/managed manifest exists.
  rmSync(join(f.scripts,'insrc-daemon-install.sh'));
  const worker = join(f.root,'update.mjs');
  writeFileSync(worker, `process.env.NODE_OPTIONS='--invalid-injection';process.env.NODE_PATH='/external';
const {update}=await import(${JSON.stringify(moduleUrl('maintenance'))});
const result=await update({skipSync:true},line=>process.stderr.write(line+'\\n'));
if(!result.ok)throw Error(result.error);`);
  const result = spawnSync(process.execPath,[worker],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:'',INSRC_DAEMON_ROOT:f.seed},encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(readFileSync(join(f.seed,'node_modules/.insrc-install-ok'),'utf8'),/^v2:[a-f0-9]+:22\.22\.1:/);
  for(const phase of ['preinstall','build']) {
   const record = f.records().find(r=>r.phase===phase); assert.ok(record,phase);
   assert.equal(record.version,'22.22.1'); assert.equal(record.exe,join(f.distribution,'bin/node'));
   assert.equal(record.options,null); assert.equal(record.nodePath,null);
  }
  assert.ok(!existsSync(f.fakeTrace));
 } finally { f.clean(); }
});

test('TUI daemon start retains actual owned child identity and fails closed on corrupt runtime', nativeOptions, () => {
 const f = ownedSourceFixture();
 try {
  mkdirSync(join(f.seed,'out/daemon'),{recursive:true}); mkdirSync(join(f.seed,'node_modules'),{recursive:true});
  symlinkSync(resolve('node_modules/tsx'),join(f.seed,'node_modules/tsx'));
  const entry = join(f.seed,'out/daemon/index.js');
  writeFileSync(entry, `import fs from 'node:fs';import net from 'node:net';
const root=process.env.HOME+'/.insrc';
fs.writeFileSync(root+'/daemon.pid',String(process.pid));
fs.writeFileSync(root+'/identity.json',JSON.stringify({version:process.versions.node,exe:process.execPath,options:process.env.NODE_OPTIONS,path:process.env.NODE_PATH}));
const server=net.createServer(s=>s.on('data',()=>{s.end();server.close(()=>process.exit(0));}));
server.listen(root+'/daemon.sock');setTimeout(()=>process.exit(3),15000).unref();`);
  const worker=join(f.root,'start.mjs');
  writeFileSync(worker, `import assert from 'node:assert/strict';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {once} from 'node:events';import fs from 'node:fs';import net from 'node:net';
const original=cp.spawn;let child;
cp.spawn=function(command,args,options){const c=original(command,args,options);if(args.includes(${JSON.stringify(entry)})){child=c;c.ref();}return c;};syncBuiltinESMExports();
process.env.NODE_OPTIONS='--invalid-injection';process.env.NODE_PATH='/external';
const {startDaemon}=await import(${JSON.stringify(moduleUrl('daemon'))});
try {
 const result=await startDaemon();assert.equal(result.started,true);assert.ok(child);
 const closed=once(child,'close');child.ref();
 const identity=JSON.parse(fs.readFileSync(process.env.HOME+'/.insrc/identity.json'));
 assert.deepEqual(identity,{version:'22.22.1',exe:${JSON.stringify(join(f.distribution,'bin/node'))}});
 const socket=net.createConnection(process.env.HOME+'/.insrc/daemon.sock');socket.on('error',()=>{});socket.end('shutdown');
 const [code]=await closed;assert.equal(code,0);
 fs.unlinkSync(process.env.HOME+'/.insrc/daemon.pid');
 fs.writeFileSync(${JSON.stringify(join(f.distribution,'LICENSE'))},'corrupt');child=undefined;
 await assert.rejects(startDaemon(),/Verified local Node toolchain unavailable/);assert.equal(child,undefined);
} finally {cp.spawn=original;syncBuiltinESMExports();if(child&&child.exitCode===null){child.ref();const closed=once(child,'close');child.kill();await closed;}}`);
  const result=spawnSync(process.execPath,[worker],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:'',INSRC_DAEMON_ROOT:f.seed},encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.ok(!existsSync(f.fakeTrace));
 } finally {f.clean();}
});
