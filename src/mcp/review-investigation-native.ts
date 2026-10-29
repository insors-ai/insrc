/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createServer,createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,chmodSync,lstatSync,realpathSync,unlinkSync } from 'node:fs';
import { join,dirname,basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScopedReviewBinding } from '../daemon/review-investigation-bridge.js';
import { parseReviewInvestigationCommand } from '../shared/review-investigation.js';

export interface NativeReviewBridgeConfig {readonly version:1;readonly socket:string;readonly binding:ScopedReviewBinding;}
export const NATIVE_REVIEW_BINDING_ENV='INSRC_REVIEW_NATIVE_BINDING_ID';
/** The configuration pins the logical prefix; an invocation receives only its
 * own capability filename through private runtime data, never a shared alias. */
export function nativeReviewBindingPath(cwd:string,bindingId?:string):string{
 if(bindingId!==undefined&&!/^[a-f0-9]{64}$/.test(bindingId))throw Error('Invalid native binding identity');
 return join(cwd,bindingId===undefined?'investigation-binding.json':`investigation-binding-${bindingId}.json`);
}
export function resolveNativeReviewBindingPath(logicalPath:string,bindingId:string|undefined):string{
 if(basename(logicalPath)!=='investigation-binding.json'||!bindingId)throw Error('Private invocation binding required');return nativeReviewBindingPath(dirname(logicalPath),bindingId);
}
function privateDirectory(path:string){const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||realpathSync(path)!==path)throw Error('Native bridge directory is not private');}
export function readNativeReviewBridgeConfig(path:string):NativeReviewBridgeConfig{
 privateDirectory(dirname(path));const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>16384)throw Error('Unsafe native bridge binding');
  const config=JSON.parse(readFileSync(fd,'utf8')) as NativeReviewBridgeConfig;
  if(config.version!==1||dirname(config.socket)!==dirname(path)||!Number.isSafeInteger(config.binding.expiresAt)||config.binding.expiresAt<=Date.now())throw Error('Expired or foreign native bridge');
  const {expiresAt:_,...binding}=config.binding;parseReviewInvestigationCommand({...binding,operation:'read',reference:'validation'});return config;
 }finally{closeSync(fd);}
}
/** Private per-session socket: no method names or general daemon forwarding exist on this transport. */
export async function startNativeReviewBroker(cwd:string,binding:ScopedReviewBinding,forward:(command:unknown)=>Promise<unknown>){
 privateDirectory(cwd);const socketPath=join(cwd,`review-${randomUUID()}.sock`),bindingPath=nativeReviewBindingPath(cwd,binding.bindingId),clients=new Set<Socket>();
 const server=createServer(socket=>{
  clients.add(socket);let text='',dispatched=false;socket.setEncoding('utf8');socket.setTimeout(Math.max(1,Math.min(300000,binding.expiresAt-Date.now())),()=>socket.destroy());
  socket.on('close',()=>clients.delete(socket));socket.on('error',()=>{});
  socket.on('data',(chunk:string)=>{
   if(dispatched)return;text+=chunk;if(Buffer.byteLength(text)>1024*1024){socket.destroy();return;}
   const newline=text.indexOf('\n');if(newline<0)return;dispatched=true;
   void (async()=>{try{
    if(text.slice(newline+1).trim())throw Error('One command per connection');
    const command=parseReviewInvestigationCommand(JSON.parse(text.slice(0,newline)));
    if(!('bindingId' in command)||command.bindingId!==binding.bindingId)throw Error('Foreign native capability');
    const result=await forward(command);socket.end(`${JSON.stringify({ok:true,result})}\n`);
   }catch{socket.end(`${JSON.stringify({ok:false,error:'Scoped review operation refused.'})}\n`);}})();
  });
 });
 let createdBinding=false;
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.removeListener('error',reject);resolve();});});chmodSync(socketPath,0o600);
  const config:NativeReviewBridgeConfig={version:1,socket:socketPath,binding},fd=openSync(bindingPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  createdBinding=true;
  try{writeFileSync(fd,JSON.stringify(config));}finally{closeSync(fd);}
  return {bindingPath,close:async()=>{for(const c of clients)c.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));try{unlinkSync(bindingPath);}catch{/* Private runtime can be retained after a crash. */}}};
 }catch(cause){for(const c of clients)c.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));if(createdBinding)try{unlinkSync(bindingPath);}catch{/* Private failed temporary is never acceptance authority. */}throw cause;}
}
export function forwardNativeReviewCommand(config:NativeReviewBridgeConfig,command:unknown):Promise<unknown>{
 return new Promise((resolve,reject)=>{
  const socket=createConnection(config.socket);let text='',settled=false;
  const fail=()=>{if(settled)return;settled=true;socket.destroy();reject(Error('Scoped native bridge unavailable'));};
  socket.setEncoding('utf8');socket.setTimeout(Math.max(1,Math.min(300000,config.binding.expiresAt-Date.now())),fail);socket.on('error',fail);socket.on('end',()=>{if(!settled)fail();});
  socket.on('connect',()=>socket.write(`${JSON.stringify(command)}\n`));
  socket.on('data',(chunk:string)=>{text+=chunk;if(Buffer.byteLength(text)>2*1024*1024){fail();return;}const end=text.indexOf('\n');if(end<0)return;
   try{const reply=JSON.parse(text.slice(0,end)) as {ok:boolean;result:unknown};if(reply.ok!==true){fail();return;}settled=true;socket.destroy();resolve(reply.result);}catch{fail();}
  });
 });
}
