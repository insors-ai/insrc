import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { NODE_RUNTIME_ASSETS, assertPackagedRuntimeAssets, assertPackagedSourceBootstrap, packageNodeRuntimeInstaller } from '../node-runtime-assets.mjs';
import { composeMcpEntry } from '../../vscode-plugin/src/hosts/mcp-writer.js';
import { archive, nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

const source=readFileSync(resolve('scripts/insrc-daemon-install.sh'),'utf8');
test('qualified IDE payload refuses development installers without release authority',()=>{
 assert.throws(()=>assertPackagedSourceBootstrap(packageNodeRuntimeInstaller(source)),/authenticated release bootstrap/);
 const bogus=source.replace("INSRC_RELEASE_BOOTSTRAP_B64=''",`INSRC_RELEASE_BOOTSTRAP_B64='${Buffer.from('missing public authority').toString('base64')}'`);
 assert.throws(()=>assertPackagedSourceBootstrap(packageNodeRuntimeInstaller(bogus)),/public authority/);
});
test('packaged installer embeds exactly the canonical shared runtime assets and detects drift',()=>{
 const packaged=packageNodeRuntimeInstaller(source);
 assertPackagedRuntimeAssets(packaged);
 // BSD tar hides AppleDouble metadata from its own listing; inspect the real
 // member headers too so a macOS-produced client is portable to GNU tar.
 const encoded=packaged.match(/^INSRC_NODE_BOOTSTRAP_B64='([^']+)'$/m)![1]!;
 const tar=gunzipSync(Buffer.from(encoded,'base64')), members:string[]=[];
 for(let offset=0;offset+512<=tar.length;){
  const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const name=header.toString('utf8',0,100).split('\0')[0]!;
  const size=parseInt(header.toString('ascii',124,136).replace(/\0.*$/s,'').trim(),8);
  assert.ok(Number.isSafeInteger(size)&&size>=0);
  if(header[156]===0||header[156]===48)members.push(name);
  if(header[156]===120)assert.doesNotMatch(tar.subarray(offset+512,offset+512+size).toString('utf8'),/LIBARCHIVE\.xattr\.|SCHILY\.xattr\./);
  offset+=512+Math.ceil(size/512)*512;
 }
 assert.deepEqual(members.sort(),[...NODE_RUNTIME_ASSETS].sort());
 assertPackagedRuntimeAssets(readFileSync(resolve('vscode-plugin/assets/insrc-daemon-install.sh'),'utf8'));
 assert.match(packaged,/^INSRC_NODE_BOOTSTRAP_SHA256='[a-f0-9]{64}'$/m);
 assert.throws(()=>assertPackagedRuntimeAssets(packaged.replace(/(INSRC_NODE_BOOTSTRAP_B64=')./,'$1!')),/lacks verified/);
 const changed=packaged.replace(/INSRC_NODE_BOOTSTRAP_SHA256='[a-f0-9]{64}'/,"INSRC_NODE_BOOTSTRAP_SHA256='"+'0'.repeat(64)+"'");
 assert.throws(()=>assertPackagedRuntimeAssets(changed),/digest mismatch/);
 assert.throws(()=>packageNodeRuntimeInstaller('without markers'),/markers missing/);
});

const { NODE_RUNTIME_POLICY } = await import(new URL('../node-runtime-policy.mjs', import.meta.url).href);
const publicTarget = NODE_RUNTIME_POLICY.targets[`${process.platform}-${process.arch}`];
test('standalone packaged installer bootstraps official Node without global Node or adjacent files', {
 ...nativeOptions, skip: nativeOptions.skip || !publicTarget?.enabled,
},()=>{
 const root=mkdtempSync(join(tmpdir(),'insrc-public-bootstrap-'));
 try{
  const packaged=packageNodeRuntimeInstaller(source);assertPackagedRuntimeAssets(packaged);
  const alone=join(root,'isolated installer.sh');writeFileSync(alone,packaged,{mode:0o700});
  const home=join(root,'fresh-home');mkdirSync(home);
  const env={...process.env,HOME:home,TMPDIR:root,PATH:'/usr/bin:/bin',NODE_OPTIONS:'--invalid-injection',NODE_PATH:'/external'};
  const absent=spawnSync('/bin/sh',['-c','command -v node || command -v npm'],{env,encoding:'utf8'});assert.notEqual(absent.status,0);
  const first=spawnSync(alone,['--print-runtime','--runtime-archive',archive],{cwd:root,env,encoding:'utf8',timeout:60000});
  assert.equal(first.status,0,first.stderr);const node=first.stdout.trim();
  const identity=spawnSync(node,['-p','JSON.stringify({version:process.versions.node,exe:process.execPath})'],{env:{...env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8'});
  assert.deepEqual(JSON.parse(identity.stdout),{version:'22.22.1',exe:node});
  const pipe=spawnSync('/bin/bash',['-s','--','--print-runtime'],{input:packaged,cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(pipe.status,0,pipe.stderr);assert.equal(pipe.stdout,first.stdout);
  assert.ok(!readdirSync(root).some(name=>name.startsWith('insrc-runtime-assets-')));
 }finally{rmSync(root,{recursive:true,force:true});}
});


test('IDE-composed MCP registration executes the official owned runtime wrapper and preserves caller cwd',nativeOptions,()=>{
 const f=ownedSourceFixture();
 try{
  mkdirSync(join(f.seed,'out/bin'),{recursive:true});const caller=join(f.root,'project');mkdirSync(caller);
  writeFileSync(join(f.seed,'out/bin/insrc-mcp.js'),`process.stdout.write(JSON.stringify({version:process.versions.node,exe:process.execPath,cwd:process.cwd()}));`);
  const entry=composeMcpEntry(join(f.scripts,'insrc-mcp'))!;
  assert.equal(entry.command,'/bin/bash');
  const result=spawnSync(entry.command,entry.args,{cwd:caller,env:f.env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{version:'22.22.1',exe:join(f.distribution,'bin/node'),cwd:caller});
  assert.ok(!existsSync(f.fakeTrace));
 }finally{f.clean();}
});
