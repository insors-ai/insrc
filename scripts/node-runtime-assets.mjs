/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NODE_RUNTIME_POLICY, readNodeRuntimePolicy, renderNodeRuntimeShell } from './node-runtime-policy.mjs';
import { fileURLToPath } from 'node:url';

export const NODE_RUNTIME_ASSETS = Object.freeze([
 'scripts/provision-node-runtime.sh', 'scripts/node-runtime-archive.sh',
 'scripts/node-runtime-env.sh', 'scripts/node-runtime-policy.sh',
 'scripts/node-runtime-policy.mjs', 'scripts/node-runtime-store.mjs',
 'src/assets/node-runtime-policy.json',
]);
const root = fileURLToPath(new URL('../', import.meta.url));

export function copyNodeRuntimeAssets(source, destination) {
 const policy=readNodeRuntimePolicy(JSON.parse(readFileSync(join(source,'src/assets/node-runtime-policy.json'),'utf8')));
 if(policy.nodeVersion!==NODE_RUNTIME_POLICY.nodeVersion||readFileSync(join(source,'scripts/node-runtime-policy.sh'),'utf8')!==renderNodeRuntimeShell(policy))throw new Error('Node runtime packaging policy drift');
 for (const file of NODE_RUNTIME_ASSETS) {
  mkdirSync(dirname(join(destination,file)),{recursive:true});
  cpSync(join(source,file),join(destination,file),{errorOnExist:true,force:false});
 }
}

/** Embed only the fixed project-owned bootstrap assets; extraction needs no Node. */
export function packageNodeRuntimeInstaller(source, assetRoot = root) {
 const stage=mkdtempSync(join(tmpdir(),'insrc-bootstrap-assets-'));
 try {
  copyNodeRuntimeAssets(assetRoot,stage);
  const archive=execFileSync('/usr/bin/tar',['-czf','-','-C',stage,...NODE_RUNTIME_ASSETS],{maxBuffer:1024*1024,env:{...process.env,COPYFILE_DISABLE:'1'}});
  const marker=/^INSRC_NODE_BOOTSTRAP_B64='[^']*'$/m, digest=/^INSRC_NODE_BOOTSTRAP_SHA256='[^']*'$/m;
  if(!marker.test(source)||!digest.test(source))throw new Error('installer runtime bootstrap markers missing');
  return source.replace(marker,`INSRC_NODE_BOOTSTRAP_B64='${archive.toString('base64')}'`)
   .replace(digest,`INSRC_NODE_BOOTSTRAP_SHA256='${createHash('sha256').update(archive).digest('hex')}'`);
 } finally {rmSync(stage,{recursive:true,force:true});}
}

/** Refuse release/client asset drift even when an externally signed installer is supplied. */
export function assertPackagedRuntimeAssets(source, assetRoot = root) {
 const encoded=source.match(/^INSRC_NODE_BOOTSTRAP_B64='([A-Za-z0-9+/=]+)'$/m)?.[1];
 const digest=source.match(/^INSRC_NODE_BOOTSTRAP_SHA256='([a-f0-9]{64})'$/m)?.[1];
 if(!encoded||!digest)throw new Error('packaged installer lacks verified runtime assets');
 const archive=Buffer.from(encoded,'base64');
 if(archive.length>1024*1024||createHash('sha256').update(archive).digest('hex')!==digest)throw new Error('embedded runtime asset digest mismatch');
 const entries=execFileSync('/usr/bin/tar',['-tzf','-'],{input:archive,encoding:'utf8',maxBuffer:1024*1024}).trim().split('\n');
 if(JSON.stringify(entries.slice().sort())!==JSON.stringify([...NODE_RUNTIME_ASSETS].sort()))throw new Error('embedded runtime asset set differs');
 for(const file of NODE_RUNTIME_ASSETS){
  const content=execFileSync('/usr/bin/tar',['-xzOf','-',file],{input:archive,maxBuffer:1024*1024});
  if(!content.equals(readFileSync(join(assetRoot,file))))throw new Error(`embedded runtime asset drift: ${file}`);
 }
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [output]=process.argv.slice(2);if(!output)throw new Error('usage: node-runtime-assets.mjs OUTPUT_INSTALLER');
 writeFileSync(output,packageNodeRuntimeInstaller(readFileSync(join(root,'scripts/insrc-daemon-install.sh'),'utf8')),{mode:0o755});
}
