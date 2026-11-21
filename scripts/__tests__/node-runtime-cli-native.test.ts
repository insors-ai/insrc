import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
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
    const result = spawnSync(link, [], {cwd:caller, env:{...f.env,PATH:path}, encoding:'utf8',timeout:30000});
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


test('packaged launchers verify retained signed runtime before executing tools Node', {...nativeOptions, skip: nativeOptions.skip || process.platform !== 'darwin'}, async () => {
 const f=ownedSourceFixture();
 try {
  rmSync(join(f.seed,'.git'),{recursive:true,force:true});
  mkdirSync(join(f.seed,'tools'));copyFileSync(join(f.distribution,'bin/node'),join(f.seed,'tools/node'));chmodSync(join(f.seed,'tools/node'),0o700);
  mkdirSync(join(f.seed,'out/cli'),{recursive:true});mkdirSync(join(f.seed,'out/bin'),{recursive:true});
  const observe=`process.stdout.write(JSON.stringify({version:process.versions.node,exe:process.execPath}));`;
  writeFileSync(join(f.seed,'out/cli/index.js'),observe);writeFileSync(join(f.seed,'out/bin/insrc-mcp.js'),observe);
  // Same verifier with only its module location adapted to the compiled test checkout.
  const verifier=readFileSync(resolve('scripts/verify-installed-runtime.mjs'),'utf8').replaceAll("'../out/", "'"+pathToFileURL(resolve('out')).href+'/');
  writeFileSync(join(f.scripts,'verify-installed-runtime.mjs'),verifier);
  const {measureBundleRuntime}=await import('../../scripts/stage-daemon-bundle.mjs');
  const fingerprint=await measureBundleRuntime(f.seed);
  const state=join(f.home,'.insrc');const managed=join(state,'managed-lifecycle');mkdirSync(managed,{mode:0o700});
  const trust=join(state,'bundle-trust');mkdirSync(trust,{mode:0o700});
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');writeFileSync(join(trust,'production.pem'),publicKey.export({type:'spki',format:'pem'}),{mode:0o400});
  const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
  const commit='a'.repeat(40),archiveSha256='b'.repeat(64);
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,commit,sequence:1,channel:'macos-arm64-pilot',archiveSha256,runtimeFingerprint:fingerprint}));
  const proof={version:1,fingerprint,manifestBase64:bytes.toString('base64'),signatureBase64:sign(null,Buffer.concat([Buffer.from('insrc-daemon-bundle-production-v1\0'),bytes]),privateKey).toString('base64'),floor:{domain:'production',channel:'macos-arm64-pilot',sequence:1,manifestSha256:sha(bytes),archiveSha256}};
  const installation={version:1,stateRoot:state,releaseRoot:f.seed,releaseId:commit,runtime:join(f.seed,'tools/node'),pathEnv:'/usr/bin:/bin',enabled:true};
  writeFileSync(join(managed,'installation.json'),JSON.stringify(installation),{mode:0o600});
  writeFileSync(join(managed,'journal.json'),JSON.stringify({version:1,root:state,active:null,outcome:null,installedBundle:{releaseRoot:f.seed,proof},daemonBundleFloors:[proof.floor]}),{mode:0o600});
  for(const name of ['insrc','insrc-mcp']){
   const r=spawnSync(join(f.scripts,name),[],{env:f.env,encoding:'utf8',timeout:30000});
   assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{version:'22.22.1',exe:installation.runtime});
  }
  // Executable malicious bytes must not run even once.
  writeFileSync(installation.runtime,`#!/bin/sh\nprintf executed > '${f.fakeTrace}'\n`);
  for(const name of ['insrc','insrc-mcp']){
   const r=spawnSync(join(f.scripts,name),[],{env:f.env,encoding:'utf8',timeout:30000});
   assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/integrity verification failed.*repair/);assert.ok(!existsSync(f.fakeTrace));
  }
 } finally {f.clean();}
});
