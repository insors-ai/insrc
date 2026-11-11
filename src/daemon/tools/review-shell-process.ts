/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { ChildProcess } from 'node:child_process';
import { PassThrough, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { ReviewNativeTransport } from '../../shared/review-process-bridge.js';
import type { ReviewProcessOutcome, ReviewProcessReservation } from '../../shared/review-native.js';
import type { ProcessDisposal } from '../../shared/process-group.js';
import type { ManagedExit, ManagedSpawnOptions } from './shell-helper.js';

/** Only an event/stream facade, never a native handle or PID. Existing tool
 * consumers retain their decoding, truncation, input and result logic. */
export function launchReviewShell(transport:ReviewNativeTransport,command:string,args:readonly string[],options:ManagedSpawnOptions){
 const modes=options.stdio??['ignore','pipe','pipe'];
 if(!Array.isArray(modes)||modes.length!==3||modes.some(mode=>mode!=='pipe'&&mode!=='ignore'))throw new Error('Unsupported review managed stdio');
 const controller=new AbortController();
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 const child=new ChildProcess(),stdout=new PassThrough({highWaterMark:65536}),stderr=new PassThrough({highWaterMark:65536});
 child.stdout=modes[1]==='pipe'?stdout:null;child.stderr=modes[2]==='pipe'?stderr:null;
 let disposal:ProcessDisposal={state:'unknown',reason:'child_not_closed'},outcome:ReviewProcessOutcome|undefined;
 let finishedRun=false;
 let internalTermination=false;
 const env=Object.fromEntries(Object.entries(options.env??process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
 const reserved=Promise.resolve().then(()=>transport.reserve({kind:'tool',command,args,cwd:options.cwd??process.cwd(),env,keepStdinOpen:modes[0]==='pipe',...(options.timeoutMs!==undefined?{timeoutMs:options.timeoutMs}:{})}));
 const cancel=()=>{void reserved.then(r=>transport.cancel(r)).catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 const terminate=()=>{internalTermination=true;controller.abort();};
 child.kill=()=>{terminate();return true;};
 const send=async(bytes:Buffer,end:boolean)=>{
  const r=await reserved,started=await transport.waitStarted(r);
  if(!started.spawned||finishedRun)throw Object.assign(new Error('Native review stdin is closed'),{code:'EPIPE'});
  for(let at=0;at<bytes.length;at+=65536)await transport.write(r,new Uint8Array(bytes.subarray(at,at+65536)),false);
  if(end)await transport.write(r,new Uint8Array(),true);
 };
 child.stdin=modes[0]==='pipe'?new Writable({highWaterMark:65536,write:(chunk:Buffer,_encoding,callback)=>{void send(chunk,false).then(()=>callback(),callback);},final:callback=>{void send(Buffer.alloc(0),true).then(()=>callback(),callback);}}):null;
 // A raw managed caller may not install an input error handler. EPIPE remains
 // observable to listeners but cannot become an uncaught worker exception.
 child.stdin?.on('error',()=>{});
 let activeInput=true;
 const consume=async(r:ReviewProcessReservation,output:{operationId:string;workerIncarnation:string;stream:'stdout'|'stderr';bytes:Uint8Array})=>{
  if(output.operationId!==r.operationId||output.workerIncarnation!==r.workerIncarnation||output.bytes.byteLength>65536)throw new Error('Invalid managed review output');
  const stream=output.stream==='stdout'?child.stdout:child.stderr;
  if(!stream||!activeInput)return;
  await new Promise<void>((resolve,reject)=>{(stream as PassThrough).write(Buffer.from(output.bytes),error=>error?reject(error):resolve());});
 };
 const stopOutput=()=>{activeInput=false;stdout.destroy();stderr.destroy();};
 signal.addEventListener('abort',stopOutput,{once:true});
 const settled=(async():Promise<ManagedExit>=>{
  let reservation:ReviewProcessReservation|undefined;
  try{
   reservation=await reserved;
   const receipt=await transport.saveOpenIntent(reservation);
   const run=transport.start(reservation,receipt,output=>consume(reservation!,output));
   void transport.waitStarted(reservation).then(started=>{if(started.spawned&&!finishedRun)child.emit('spawn');}).catch(()=>{});
   outcome=await run;disposal=outcome.disposal;
   if(outcome.aborted||outcome.timedOut||disposal.state==='unknown')stopOutput();
   if(disposal.state!=='confirmed')throw new Error('Review native disposal is unknown');
   await transport.saveClosedIntent(reservation);
   if(outcome.error)child.emit('error',new Error(outcome.error.detail??`Review native operation failed: ${outcome.error.code}`));
   return{code:outcome.code,signal:outcome.signal,timedOut:outcome.timedOut,aborted:outcome.aborted&&(!internalTermination||options.signal?.aborted===true)};
  }catch(error){
   if(reservation&&!outcome){outcome=await transport.cancel(reservation);disposal=outcome.disposal;if(disposal.state==='confirmed')await transport.saveClosedIntent(reservation);}
   child.emit('error',error instanceof Error?error:new Error(String(error)));
   return{code:null,signal:null,timedOut:false,aborted:signal.aborted};
  }finally{
   finishedRun=true;signal.removeEventListener('abort',cancel);signal.removeEventListener('abort',stopOutput);
   child.stdin?.destroy();stdout.end();stderr.end();
   // Let existing text decoders flush before the result becomes visible.
   await Promise.all([finished(stdout,{readable:stdout.readableFlowing===true}).catch(()=>{}),finished(stderr,{readable:stderr.readableFlowing===true}).catch(()=>{})]);
   child.emit('exit',outcome?.code??null,outcome?.signal??null);child.emit('close',outcome?.code??null,outcome?.signal??null);
  }
 })();
 return{spawned:true as const,child,settled,terminate,disposal:()=>disposal};
}
