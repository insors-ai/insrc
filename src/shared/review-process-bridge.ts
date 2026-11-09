/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { StringDecoder } from 'node:string_decoder';
import type { ProcessGroupOpts, ProcessGroupResult } from './process-group.js';
import type { ReviewNativeCommand, ReviewProcessReservation, ReviewIntentReceipt, ReviewProcessOutput, ReviewProcessOutcome } from './review-native.js';

/** Worker endpoint. The host binds every operation to the registered port's
 * owner; client fields never establish authority. Persistence uses the family's
 * serialized checkpoint writer, before start and after confirmed disposal. */
export interface ReviewNativeTransport {
 resolveBinary(command: string): Promise<string>;
 reserve(command: ReviewNativeCommand): Promise<ReviewProcessReservation>;
 saveOpenIntent(reservation: ReviewProcessReservation): Promise<ReviewIntentReceipt>;
 start(reservation: ReviewProcessReservation, receipt: ReviewIntentReceipt, consume: (output: ReviewProcessOutput)=>Promise<void>): Promise<ReviewProcessOutcome>;
 cancel(reservation: ReviewProcessReservation): Promise<ReviewProcessOutcome>;
 saveClosedIntent(reservation: ReviewProcessReservation): Promise<void>;
}
const context=new AsyncLocalStorage<ReviewNativeTransport>();
/** One scope per review worker. No provider model/response data is parsed by
 * this transport; the existing CliProvider continues to do that in the worker. */
export function withReviewNativeTransport<T>(transport: ReviewNativeTransport, fn: ()=>T): T { return context.run(transport,fn); }
export function reviewNativeTransport(): ReviewNativeTransport | undefined { return context.getStore(); }

/** Worker-side byte adapter for the existing process-group contract. Only
 * bounded mode collects stdout; activity mode feeds the existing stream parser
 * sequentially with host backpressure. Native handles never cross the bridge. */
export async function runReviewNativeProcess(transport: ReviewNativeTransport, command: string, args: readonly string[], opts: ProcessGroupOpts): Promise<ProcessGroupResult> {
 const began=Date.now();
 if(opts.signal?.aborted)return {stdout:'',stderr:'',exitCode:-1,timedOut:false,aborted:true,durationMs:0};
 const env=opts.env===undefined?undefined:Object.fromEntries(Object.entries(opts.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
 const reservation=await transport.reserve({kind:'cli',command,args,cwd:opts.cwd??process.cwd(),stdin:Buffer.from(opts.stdin??''),...(env?{env}:{}),...(opts.mode!=='activity'?{timeoutMs:opts.timeoutMs}:{})});
 let stdout='',stderr='',stalled=false,observerError:unknown;
 const stdoutDecoder=new StringDecoder('utf8'),stderrDecoder=new StringDecoder('utf8');
 let stderrTail=Buffer.alloc(0);
 let stallTimer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{void transport.cancel(reservation).catch(()=>{});};
 const stall=opts.mode!=='activity'&&opts.stall&&opts.stall.ms<opts.timeoutMs?opts.stall:undefined;
 const arm=()=>{if(stall){clearTimeout(stallTimer);stallTimer=setTimeout(()=>{if(stall.silence||!stall.started(stdout)){stalled=true;cancel();}},stall.ms);}};
 opts.signal?.addEventListener('abort',cancel,{once:true});
 if(opts.signal?.aborted)cancel();
 let outcome:ReviewProcessOutcome|undefined;
 try {
  const receipt=await transport.saveOpenIntent(reservation);
  arm();
  outcome=await transport.start(reservation,receipt,async output=>{
   if(output.operationId!==reservation.operationId||output.workerIncarnation!==reservation.workerIncarnation||output.bytes.byteLength>65536)throw new Error('Invalid review native output');
   if(opts.signal?.aborted||stalled)return;
   const bytes=Buffer.from(output.bytes);
   if(output.stream==='stderr'){
    if(opts.mode==='activity')stderrTail=Buffer.concat([stderrTail,bytes]).subarray(-65536);
    else stderr+=stderrDecoder.write(bytes);
   }
   else if(opts.mode==='activity'){
    try {await opts.onStdoutChunk(bytes);}catch(error){observerError=error;throw error;}
   }else {stdout+=stdoutDecoder.write(bytes);if(stall?.silence)arm();}
  });
  if(outcome.disposal.state!=='confirmed')throw new Error('Review native disposal is unknown');
  await transport.saveClosedIntent(reservation);
  if(observerError!==undefined)throw observerError;
  if(outcome.error&&!outcome.spawnError)throw new Error(`Review native operation failed: ${outcome.error.code}`);
  stdout+=stdoutDecoder.end();stderr=opts.mode==='activity'?stderrTail.toString():stderr+stderrDecoder.end();
  return {stdout,stderr,exitCode:outcome.code??-1,timedOut:outcome.timedOut,durationMs:Date.now()-began,...(outcome.aborted&&!stalled?{aborted:true}:{}),...(stalled?{stalled:true}:{}),...(outcome.spawnError?{spawnError:'Native CLI could not be spawned'}:{})};
 }catch(error){
  // An intent-save or observer failure still owns a reservation. Never leave
  // its native command running, and never clear a guard without positive proof.
  if(!outcome){outcome=await transport.cancel(reservation);if(outcome.disposal.state==='confirmed')await transport.saveClosedIntent(reservation);}
  throw error;
 }finally {clearTimeout(stallTimer);opts.signal?.removeEventListener('abort',cancel);}
}
