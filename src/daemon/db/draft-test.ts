/** One operation owns preparation, one child, and reaping until true drain. */
import {fork} from 'node:child_process';
import type {ChildProcess,ForkOptions} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {ConnectionConfig} from '../../shared/db-driver.js';
import type {DraftTestRequest,DraftTestResult,EffectiveDraft,TestCancellation} from '../../shared/connection-management.js';
import {DRAFT_TEST_MESSAGES,parseDraftTestRequest,parseTestCancellation} from '../../shared/connection-management-wire.js';
import type {TrustedRpcContext} from '../request-context.js';
import {prepareDynamoAuth} from './dynamo-identity.js';
import {parseProbeWorkerResult,parseProbeWorkerStart} from './draft-probe.js';
import type {ProbeWorkerStart,ProbeWorkerResult} from './draft-probe.js';
export const PROBE_DEADLINE_MS=10000,PROBE_CANCEL_GRACE_MS=250,PROBE_CAPACITY=4;
export class DraftTestAdmissionError extends Error {
 constructor(readonly code:'busy'|'session-expired'){super(code==='busy'?'Connection test capacity is busy. Retry when cleanup completes.':'Connection test transport is unavailable.');}
}
export type DraftPreparation=(signal:AbortSignal,drained:Promise<void>)=>Promise<EffectiveDraft>;
interface Active {readonly requestId:string;readonly epoch:string;readonly stop:()=>boolean;readonly drained:Promise<void>}
/** Explicit projection excludes saved references and runtime authority from private config. */
function workerConfig(config:ConnectionConfig):ConnectionConfig {
 const {id,kind,family,label,url,path,schemaSource,namespace,pii,options,recursive,partitioning}=config;
 return JSON.parse(JSON.stringify({id,kind,family,label,url,path,schemaSource,namespace,pii,options,recursive,partitioning})) as ConnectionConfig;
}
export function probeWorkerEnvironment():NodeJS.ProcessEnv {
 const env:NodeJS.ProcessEnv={INSRC_MODE:'probe-worker',TSX_DISABLE_CACHE:'1'};
 for(const name of ['PATH','HOME','TMPDIR','SystemRoot'])if(process.env[name]!==undefined)env[name]=process.env[name];
 return env;
}
export class DraftTestSupervisor {
 readonly #active=new Map<string,Active>();
 #stopping=false;
 constructor(private readonly spawnWorker:(entry:string,options:ForkOptions)=>ChildProcess=(entry,options)=>fork(entry,[],options)){}
 get activeCount():number{return this.#active.size;}
 run(input:unknown,context:TrustedRpcContext,prepare:DraftPreparation):Promise<DraftTestResult>{
  const began=performance.now();
  const request=parseDraftTestRequest(input);
  if(!context.connectionIdentity||!context.daemonEpoch||!context.registerDrain)throw new DraftTestAdmissionError('session-expired');
  if(this.#stopping||this.#active.has(context.connectionIdentity)||this.#active.size>=PROBE_CAPACITY)throw new DraftTestAdmissionError('busy');
  const controller=new AbortController();let child:ChildProcess|undefined,grace:ReturnType<typeof setTimeout>|undefined;
  let resolveResult!:(value:DraftTestResult)=>void,rejectResult!:(reason:unknown)=>void,resolveDrain!:()=>void,terminal=false;
  const response=new Promise<DraftTestResult>((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;}),drained=new Promise<void>(resolve=>{resolveDrain=resolve;});
  // Registration and reservation happen synchronously before any preparation await.
  try { context.registerDrain(drained); } catch (error) { resolveDrain(); throw error; }
  const finish=(status:DraftTestResult['status'],message?:string):void=>{
   if(terminal)return;terminal=true;
   resolveResult({requestId:request.requestId,draftRevision:request.draftRevision,repoRoot:request.key.repoRoot,daemonEpoch:context.daemonEpoch,status,tookMs:Math.max(0,performance.now()-began),...(message?{safeMessage:message}:{})});
  };
  const nonce=randomBytes(32).toString('hex');
  const stopChild=():void=>{
   if(!child||child.exitCode!==null||child.signalCode!==null)return;
   try{child.send({type:'cancel',requestId:request.requestId,nonce},()=>{});}catch{}
   grace??=setTimeout(()=>{child?.kill('SIGKILL');},PROBE_CANCEL_GRACE_MS);
  };
  const stop=(status:'timeout'|'canceled'):void=>{finish(status,DRAFT_TEST_MESSAGES[status]);controller.abort();stopChild();};
  const abort=():boolean=>{if(terminal)return false;stop('canceled');return true;};
  const timer=setTimeout(()=>stop('timeout'),PROBE_DEADLINE_MS);
  this.#active.set(context.connectionIdentity,{requestId:request.requestId,epoch:context.daemonEpoch,stop:abort,drained});
  context.signal?.addEventListener('abort',abort,{once:true});
  if(context.signal?.aborted)abort();
  void (async()=>{
   try{
    controller.signal.throwIfAborted();
    let effective:EffectiveDraft;
    try{effective=await prepare(controller.signal,drained);}catch(error){if(!terminal){terminal=true;rejectResult(error);}return;}
    controller.signal.throwIfAborted();
    context.assertRequestActive?.();
    const config=workerConfig(effective.config);
    const runtimeAuth=config.kind==='dynamodb'?await prepareDynamoAuth(config,controller.signal):undefined;
    controller.signal.throwIfAborted();
    context.assertRequestActive?.();
    if(performance.now()-began>=PROBE_DEADLINE_MS){stop('timeout');return;}
    const start:ProbeWorkerStart=parseProbeWorkerStart({type:'start',requestId:request.requestId,nonce,lookupRoot:request.key.repoRoot,config,...(runtimeAuth?{runtimeAuth}:{})});
    const compiled=fileURLToPath(new URL('../../bin/insrc-connection-test.js',import.meta.url));
    const source=compiled.replace(/\.js$/,'.ts'),entry=existsSync(compiled)?compiled:source;
    let received:ProbeWorkerResult|undefined,invalid=false;
    await new Promise<void>(resolve=>{
     child=this.spawnWorker(entry,{env:probeWorkerEnvironment(),execArgv:[...(entry.endsWith('.ts')?['--import','tsx']:[]),'--no-warnings','--max-old-space-size=384'],stdio:['ignore','ignore','ignore','ipc']});
     const onMessage=(message:unknown):void=>{
      try{if(received)throw new Error();received=parseProbeWorkerResult(message,{requestId:request.requestId,nonce});}catch{invalid=true;finish('failed',DRAFT_TEST_MESSAGES.failed);controller.abort();stopChild();}
     };
     const onError=():void=>{invalid=true;finish('failed',DRAFT_TEST_MESSAGES.failed);controller.abort();stopChild();};
     child.on('message',onMessage);child.once('error',onError);
     child.once('close',(code,signal)=>{
      child?.off('message',onMessage);child?.off('error',onError);
      if(!terminal){
       const outcome=!invalid&&code===0&&signal===null?received?.code:undefined;
       finish(outcome==='reachable'?'reachable':'failed',outcome==='reachable'?undefined:DRAFT_TEST_MESSAGES[outcome??'failed']);
      }
      resolve();
     });
     try{child.send(start,error=>{if(error){invalid=true;finish('failed',DRAFT_TEST_MESSAGES.failed);controller.abort();stopChild();}});}catch{invalid=true;finish('failed',DRAFT_TEST_MESSAGES.failed);controller.abort();stopChild();}
    });
   }catch{finish('failed',DRAFT_TEST_MESSAGES.failed);}
   finally{
    clearTimeout(timer);if(grace)clearTimeout(grace);
    context.signal?.removeEventListener('abort',abort);
    this.#active.delete(context.connectionIdentity);resolveDrain();
   }
  })();
  return response;
 }
 cancel(input:unknown,context:TrustedRpcContext):{canceled:boolean}{
  const request:TestCancellation=parseTestCancellation(input),active=this.#active.get(context.connectionIdentity);
  if(!active||active.epoch!==context.daemonEpoch||active.requestId!==request.requestId)return {canceled:false};
  return {canceled:active.stop()};
 }
 async shutdown():Promise<void>{this.#stopping=true;for(const active of this.#active.values())active.stop();await Promise.all([...this.#active.values()].map(active=>active.drained));}
}
/** Shared by v2 and legacy main-daemon adapters. */
export const connectionTestSupervisor=new DraftTestSupervisor();
