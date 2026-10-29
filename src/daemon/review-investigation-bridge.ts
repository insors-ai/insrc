/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { parseReviewInvestigationCommand,ReviewIntegrationError } from '../shared/review-investigation.js';
import { digestValue,freezeValue,snapshotValue } from '../workflow/code-review/investigation/identity.js';
import type { InvestigationTools,InvestigationTurnV1,InvestigationReplyV1,InvestigationState } from '../workflow/code-review/investigation/continuation-types.js';

export interface ScopedReviewBinding {
 readonly version:1;readonly engine:'plan-investigation-v1';readonly bindingId:string;readonly repo:string;
 readonly runId:string;readonly subjectDigest:string;readonly generation:number;readonly attemptId:string;readonly requestDigest:string;
 readonly expiresAt:number;
}
export interface ScopedReviewGrant {
 readonly repo:string;readonly turn:InvestigationTurnV1;readonly tools:InvestigationTools;
 /** Authenticated transport role supplied by the daemon, never an MCP argument. */
 readonly peer:'controller'|'native-cli';readonly signal:AbortSignal;readonly ttlMs:number;
 readonly assertCurrent:()=>void;readonly state:()=>InvestigationState;
}
interface Entry {
 readonly binding:ScopedReviewBinding;readonly grant:ScopedReviewGrant;
 readonly resolve:(reply:InvestigationReplyV1)=>void;readonly reject:(cause:unknown)=>void;
 readonly timer:ReturnType<typeof setTimeout>;readonly onAbort:()=>void;
 revoked:boolean;busy:Promise<unknown>|null;busyDigest:string|null;reply:InvestigationReplyV1|null;
}
/** Private capability broker: only four scoped operations, no general daemon dispatcher. */
export class ScopedReviewBridge {
 private readonly entries=new Map<string,Entry>();private readonly runs=new Map<string,string>();
 constructor(readonly processEpoch:string,private readonly assertProcessOwner:()=>void,private readonly now:()=>number=Date.now){}
 issue(grant:ScopedReviewGrant){
  this.assertProcessOwner();grant.signal.throwIfAborted();grant.assertCurrent();
  if(!Number.isSafeInteger(grant.ttlMs)||grant.ttlMs<1||grant.ttlMs>Math.min(300000,grant.turn.limits.attemptMs)||!['controller','native-cli'].includes(grant.peer))throw Error('Invalid scoped grant');
  if(this.runs.has(grant.turn.runId))throw new ReviewIntegrationError('identity-conflict','Previous run capability must drain before replacement');
  const binding:ScopedReviewBinding=freezeValue({version:1,engine:'plan-investigation-v1',bindingId:randomBytes(32).toString('hex'),repo:realpathSync(grant.repo),runId:grant.turn.runId,subjectDigest:grant.turn.subjectDigest,generation:grant.turn.generation,attemptId:grant.turn.attemptId,requestDigest:grant.turn.requestDigest,expiresAt:this.now()+grant.ttlMs});
  let resolve!:(reply:InvestigationReplyV1)=>void,reject!:(cause:unknown)=>void;
  const done=new Promise<InvestigationReplyV1>((yes,no)=>{resolve=yes;reject=no;});void done.catch(()=>{});
  const onAbort=()=>{void this.revoke(binding.bindingId);},timer=setTimeout(onAbort,grant.ttlMs);timer.unref();
  const entry:Entry={binding,grant,resolve,reject,timer,onAbort,revoked:false,busy:null,busyDigest:null,reply:null};
  this.entries.set(binding.bindingId,entry);this.runs.set(binding.runId,binding.bindingId);grant.signal.addEventListener('abort',onAbort,{once:true});
  if(grant.signal.aborted)onAbort();return {binding,done};
 }
 private check(entry:Entry,peer:ScopedReviewGrant['peer']){
  this.assertProcessOwner();entry.grant.assertCurrent();
  if(entry.revoked||entry.grant.peer!==peer||entry.grant.signal.aborted||this.now()>=entry.binding.expiresAt)throw new ReviewIntegrationError('identity-conflict','Scoped review capability is not active');
 }
 reconnect(bindingId:string,peer:ScopedReviewGrant['peer']){
  const entry=this.entries.get(bindingId);if(!entry)throw new ReviewIntegrationError('identity-conflict','Unknown scoped review capability');this.check(entry,peer);return entry.binding;
 }
 async dispatch(raw:unknown,peer:ScopedReviewGrant['peer']):Promise<unknown>{
  const command=parseReviewInvestigationCommand(raw);
  if(!('bindingId' in command))throw new ReviewIntegrationError('invalid-command','Only scoped review operations are accepted');
  const entry=this.entries.get(command.bindingId);if(!entry)throw new ReviewIntegrationError('identity-conflict','Unknown scoped review capability');
  this.check(entry,peer);const b=entry.binding;
  if(command.repo!==b.repo||command.runId!==b.runId||command.subjectDigest!==b.subjectDigest||command.generation!==b.generation||command.attemptId!==b.attemptId||command.requestDigest!==b.requestDigest)throw new ReviewIntegrationError('identity-conflict','Scoped command binding mismatch');
  if(entry.busy){if(entry.busyDigest===digestValue(command))return entry.busy;throw new ReviewIntegrationError('identity-conflict','Different scoped calls must be serial');}
  if(entry.reply){if(command.operation==='reply'&&digestValue(command.reply)===digestValue(entry.reply))return {accepted:true};throw new ReviewIntegrationError('identity-conflict','Scoped session already replied');}
  const work=(async()=>{
   let result:unknown;
   switch(command.operation){
    case 'read':result=await entry.grant.tools.read(command.reference);break;
    case 'impact':{
     const query=entry.grant.tools.impact.queryChangedEntityCallers;if(entry.grant.tools.impact.mode!=='indexed-impact'||!query)throw new ReviewIntegrationError('invalid-command','Caller capability unavailable');
     // sc3 durably records an impact obligation before acquisition. Surface its
     // ACK/row identities so the reviewer never has to guess a sequence or hash.
     let evidence:unknown,error:string|null=null;try{evidence=await query(command.entityRef);}catch{this.check(entry,peer);evidence=[];error='impact-unavailable';}
     const state=entry.grant.state();result={evidence,error,progress:{sequence:state.sequence,acceptedBlockReceiptIds:state.accepted.map(a=>a.receipt.progressId),coverage:state.ledger.coverage}};break;
    }
    case 'progress':result=await entry.grant.tools.progress(command.progress);break;
    case 'reply':{
     const r=command.reply,state=entry.grant.state(),ids=state.accepted.map(a=>a.receipt.progressId);
     const scope=entry.grant.tools.seed['scope'] as {packets?:readonly {blocks:readonly {blockId:string}[]}[]}|undefined;
     const known=new Set([...state.ledger.coverage.map(row=>row.requirementRef),...(scope?.packets??[]).flatMap(p=>p.blocks.map(block=>block.blockId))]);
     if(r.runId!==b.runId||r.subjectDigest!==b.subjectDigest||r.generation!==b.generation||r.attemptId!==b.attemptId||r.coverageUpdates.length||r.findings.length||r.lastAcceptedSequence!==state.sequence
      ||digestValue([...r.acceptedBlockReceiptIds].sort())!==digestValue([...ids].sort())||r.inspectedEvidenceIds.some(id=>!state.ledger.evidence.some(e=>e.evidenceId===id))||r.next.remainingWork.some(ref=>!known.has(ref)))throw new ReviewIntegrationError('invalid-command','Final reply must refer to accepted checkpoints; new deltas require progress');
     this.check(entry,peer);entry.reply=snapshotValue(r);entry.resolve(entry.reply);result={accepted:true};break;
    }
   }
   this.check(entry,peer);return result;
  })();entry.busy=work;entry.busyDigest=digestValue(command);
  try{return await work;}finally{entry.busy=null;entry.busyDigest=null;}
 }
 async revoke(bindingId:string){
  const entry=this.entries.get(bindingId);if(!entry)return;
  entry.revoked=true;clearTimeout(entry.timer);entry.grant.signal.removeEventListener('abort',entry.onAbort);entry.reject(new ReviewIntegrationError('identity-conflict','Scoped review capability revoked'));
  if(entry.busy)try{await entry.busy;}catch{/* A lost ACK never erases accepted journal progress. */}
  if(this.entries.get(bindingId)===entry)this.entries.delete(bindingId);if(this.runs.get(entry.binding.runId)===bindingId)this.runs.delete(entry.binding.runId);
 }
 async shutdown(){for(const id of [...this.entries.keys()])await this.revoke(id);}
}
