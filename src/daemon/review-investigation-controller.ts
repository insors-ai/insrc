/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LLMProvider } from '../shared/types.js';
import type { ReviewControllerBudgetDeclaration,ReviewBudgetPolicy,ReviewProviderBudgetProfile } from '../shared/review-budget.js';
import { controllerPolicy,admitControllerFrame } from '../workflow/review-pipeline/controller.js';
import { createReviewBudgetPolicy } from '../workflow/review-pipeline/budget.js';
import { scopedReviewToolCatalog } from '../shared/review-investigation-catalog.js';
import { InvestigationReplySchema,ReviewIntegrationError } from '../shared/review-investigation.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
import type { InvestigationReplyV1,InvestigationTools,InvestigationTurnV1 } from '../workflow/code-review/investigation/continuation-types.js';
import type { NativeInvestigationRuntime } from '../agent/providers/investigation-session.js';
import { ScopedReviewBridge } from './review-investigation-bridge.js';
import type { ScopedReviewBinding } from './review-investigation-bridge.js';
import type { InvestigationEnvelope } from '../shared/review-investigation-wire.js';

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});return {promise,resolve,reject};}
interface Slot {readonly binding:ScopedReviewBinding;readonly turn:InvestigationTurnV1;readonly tools:InvestigationTools;readonly runtime:NativeInvestigationRuntime;readonly drained:ReturnType<typeof deferred<void>>;}
/** Controller reasoning remains in its host. S3's provider budgets only this
 * daemon-managed scoped protocol; every model-visible frame is ALSO admitted
 * under the separate, pinned controller-reserved policy and fresh host estimate.
 * Neither profile nor host history is claimed as measured model consumption. */
export class InvestigationControllerHost {
 readonly provider:LLMProvider;readonly hostPolicy:ReviewBudgetPolicy;
 private declaration:ReviewControllerBudgetDeclaration;
 private receivedCommand:unknown;
 private readonly bridge:ScopedReviewBridge;
 private readonly slots=new Map<string,Slot>();
 private readonly ready=new Map<string,ReturnType<typeof deferred<Record<string,unknown>>>>();
 private lastAdmission:ReturnType<typeof admitControllerFrame>|null=null;
 constructor(private readonly repo:string,declaration:ReviewControllerBudgetDeclaration,indexed:boolean,epoch:string,assertProcessOwner:()=>void){
  const normalized=controllerPolicy(declaration);this.declaration=normalized.declaration;
  this.hostPolicy=createReviewBudgetPolicy(normalized.policy.profile,'controller',128000);
  const host=this.hostPolicy.profile;
  const profile:ReviewProviderBudgetProfile={profileVersion:1,providerId:`controller-bridge-${digestValue(host).slice(0,16)}`,transport:'controller-scoped-bridge',transportVersion:'1',schemaDialect:'json-v1',promptDialect:'cli-text-v1',qualification:'managed-estimate',
   declaredToolsJson:JSON.stringify(scopedReviewToolCatalog(indexed)),nativeReserveTokens:0,transportReserveTokens:host.transportReserveTokens,completionReserveTokens:host.completionReserveTokens,inspectionReserveTokens:host.inspectionReserveTokens,
   ...(host.contextWindowTokens!==undefined?{contextWindowTokens:host.contextWindowTokens}:{})};
  const noModel=async():Promise<never>=>{throw new ReviewIntegrationError('unsupported-backend','Controller reasoning must remain in its authenticated host');};
  this.provider={getReviewBudgetProfile:()=>profile,complete:noModel,completeStructured:noModel,embed:noModel,async *stream(){await noModel();},supportsTools:false,
   capabilities:{structuredOutput:true,toolCalling:false,vision:false,webSearch:false,streaming:false,embeddings:false}};
  this.bridge=new ScopedReviewBridge(epoch,assertProcessOwner);
 }
 refresh(declaration:ReviewControllerBudgetDeclaration|undefined,receivedCommand?:unknown):void{
  const next=controllerPolicy(declaration,this.hostPolicy);this.declaration=next.declaration;this.receivedCommand=receivedCommand;
 }
 private frame(value:Record<string,unknown>,receivedCommand:unknown=this.receivedCommand):Record<string,unknown>{
  const frame={...value,preflight:{qualification:'declared-estimate',limitTokens:128000,estimatedTotalTokens:0,hostContextReserveTokens:this.declaration.hostContextReserveTokens}};
  for(let i=0;i<8;i++){
   const admitted=admitControllerFrame(receivedCommand===undefined?frame:{receivedCommand,response:frame},this.hostPolicy,this.declaration),next={qualification:'declared-estimate',limitTokens:admitted.limitTokens,estimatedTotalTokens:admitted.estimatedTotalTokens,hostContextReserveTokens:this.declaration.hostContextReserveTokens};
   this.lastAdmission=admitted;if(digestValue(frame.preflight)===digestValue(next))return frame;frame.preflight=next;
  }
  throw new ReviewIntegrationError('not-ready','Controller frame estimate did not stabilize');
 }
 admission(){return this.lastAdmission;}
 active(runId:string){return this.slots.has(runId);}
 private snapshot(slot:Slot){const state=slot.runtime.state();return {sequence:state.sequence,acceptedBlockReceiptIds:state.accepted.map(a=>a.receipt.progressId),coverage:state.ledger.coverage};}
 private turnFrame(slot:Slot){return this.frame({version:1,engine:'plan-investigation-v1',next:'investigate',binding:slot.binding,turn:slot.turn,seed:slot.tools.seed,
  progress:this.snapshot(slot),navigation:slot.runtime.navigation??null,tools:JSON.parse(JSON.stringify(scopedReviewToolCatalog(slot.tools.impact.mode==='indexed-impact'))),replySchema:JSON.parse(JSON.stringify(InvestigationReplySchema)),
  guidance:'Use only the scoped operations for evidence and progress. Fresh host context is a declaration, not measured usage. Checkpoint every block; final reply must cite accepted receipts and contain no new deltas.'});}
 arm(runId:string){if(!this.ready.has(runId))this.ready.set(runId,deferred<Record<string,unknown>>());}
 async waitForTurn(runId:string,work:Promise<unknown>):Promise<Record<string,unknown>>{
  const active=this.slots.get(runId);if(active)return this.turnFrame(active);
  this.arm(runId);const ready=this.ready.get(runId)!;
  return await Promise.race([ready.promise,work.then(()=>({version:1,engine:'plan-investigation-v1',next:'status',runId}))]);
 }
 async execute(turn:InvestigationTurnV1,tools:InvestigationTools,signal:AbortSignal,runtime:NativeInvestigationRuntime):Promise<InvestigationReplyV1>{
  this.arm(turn.runId);const ready=this.ready.get(turn.runId)!;
  const grant=this.bridge.issue({repo:this.repo,turn,tools,peer:'controller',signal,ttlMs:tools.execution.timeoutMs,assertCurrent:runtime.assertCurrent,state:runtime.state});
  const slot:Slot={binding:grant.binding,turn,tools,runtime,drained:deferred<void>()};this.slots.set(turn.runId,slot);
  try{ready.resolve(this.turnFrame(slot));return await grant.done;}
  catch(cause){ready.reject(cause);throw cause;}
  finally{await this.bridge.revoke(grant.binding.bindingId);if(this.slots.get(turn.runId)===slot)this.slots.delete(turn.runId);this.ready.delete(turn.runId);slot.drained.resolve();}
 }
 async command(envelope:InvestigationEnvelope):Promise<Record<string,unknown>>{
  this.refresh(envelope.reviewBudget,envelope.command);const command=envelope.command;if(!('bindingId' in command))throw new ReviewIntegrationError('invalid-command','Expected a scoped controller operation');
  const slot=this.slots.get(command.runId);if(!slot||slot.binding.bindingId!==command.bindingId)throw new ReviewIntegrationError('identity-conflict','Controller attempt is no longer active');
  // Charge actual incoming tool args too; the host estimate may not include the current call.
  admitControllerFrame({command},this.hostPolicy,this.declaration);
  try{const value=await this.bridge.dispatch(command,'controller');return this.frame({version:1,engine:'plan-investigation-v1',next:'accepted',runId:command.runId,value},command);}
  catch(cause){if(cause instanceof Error&&cause.name==='ReviewBudgetError')await this.bridge.revoke(command.bindingId);throw cause;}
 }
 async drain(runId:string):Promise<void>{const slot=this.slots.get(runId);if(!slot)return;await this.bridge.revoke(slot.binding.bindingId);await slot.drained.promise;}
}
