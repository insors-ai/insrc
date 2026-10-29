/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { accessSync,constants,openSync,readSync,closeSync,readFileSync,realpathSync,statSync } from 'node:fs';
import { dirname,join,resolve,isAbsolute,delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { InvestigationQualificationError,investigationFileDigest } from './investigation-session.js';
import type { IsolationFile,NativeAdapterIdentity } from './investigation-session.js';
import { nativeInvestigationEnvironment } from './native-investigation-session.js';
function refuse(message:string):never{throw new InvestigationQualificationError(message);}
function executable(command:string,cwd:string,env:NodeJS.ProcessEnv):string{
 for(const dir of (env['PATH']??'').split(delimiter))try{const path=realpathSync(resolve(cwd,dir,command));accessSync(path,constants.X_OK);if(statSync(path).isFile())return path;}catch{/* Continue exact PATH search. */}return refuse(`Installed ${command} interpreter is unavailable`);
}
function header(path:string):string{const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const bytes=Buffer.alloc(256),size=readSync(fd,bytes,0,bytes.length,0);return bytes.subarray(0,size).toString('utf8');}finally{closeSync(fd);}}
/** Resolve actual execution images without executing wrapper source. A Codex
 * npm bootstrap is not its Rust review binary: both and its Node interpreter
 * must be pinned. Unknown script/package layouts remain unsupported. */
export function installedInvestigationImages(kind:'claude'|'codex',binaryPath:string,cwd:string,env:NodeJS.ProcessEnv=process.env):readonly IsolationFile[]{
 const binary=realpathSync(binaryPath),prefix=header(binary),paths=[binary];
 if(prefix.startsWith('#!')){
  const line=prefix.split('\n')[0]!.trim(),interpreter=line==='#!/usr/bin/env node'?executable('node',cwd,env):/^#!\/(?:[^\s]+\/)?node$/.test(line)?realpathSync(line.slice(2)):refuse('Unsupported installed CLI script interpreter');paths.push(interpreter);
  if(kind==='codex'){
   const packageRoot=dirname(dirname(binary)),packagePath=join(packageRoot,'package.json'),pkg=JSON.parse(readFileSync(packagePath,'utf8')) as {name?:unknown};if(pkg.name!=='@openai/codex')refuse('Unrecognized Codex bootstrap package');paths.push(packagePath);
   const platform=process.platform,arch=process.arch;if(!['linux','darwin'].includes(platform)||!['x64','arm64'].includes(arch))refuse('Unsupported native Codex platform');
   const triple=platform==='linux'?`${arch==='x64'?'x86_64':'aarch64'}-unknown-linux-musl`:`${arch==='x64'?'x86_64':'aarch64'}-apple-darwin`,platformPackage=`@openai/codex-${platform}-${arch}`;
   let vendor=join(packageRoot,'vendor');try{const metadata=createRequire(binary).resolve(`${platformPackage}/package.json`);paths.push(metadata);vendor=join(dirname(metadata),'vendor');}catch{/* Match the bootstrap's bundled-vendor fallback. */}
   const image=realpathSync(join(vendor,triple,'bin','codex'));accessSync(image,constants.X_OK);paths.push(image);
  }
 }
 return [...new Set(paths.map(path=>realpathSync(path)))].sort().map(path=>({path,digest:investigationFileDigest(path)}));
}
export function assertInstalledImagesPinned(identity:NativeAdapterIdentity,images:readonly IsolationFile[]):void{
 for(const image of images){const pin=image.path===identity.binary.path?identity.binary:identity.runtimeFiles.find(file=>file.path===image.path);if(!pin||pin.digest!==image.digest)refuse('Installed CLI execution image is absent or stale in independent probe evidence');}
}
/** --version is local metadata only, never isolation/model-call evidence. */
export function inspectInstalledInvestigation(kind:'claude'|'codex',binaryPath:string,cwd:string,env:NodeJS.ProcessEnv=process.env){
 if(!isAbsolute(binaryPath))refuse('Installed CLI inspection requires an absolute executable');
 const images=installedInvestigationImages(kind,binaryPath,cwd,env),version=execFileSync(binaryPath,['--version'],{cwd,env:nativeInvestigationEnvironment(env),encoding:'utf8',timeout:5000,maxBuffer:16384}).trim();
 if(!version||version.length>512)refuse('Installed CLI version is unavailable');
 return {kind,binaryPath:realpathSync(binaryPath),version,images,qualification:'not-established-by-version-inspection' as const};
}
