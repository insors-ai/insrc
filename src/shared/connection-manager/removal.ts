/** Confirmation owns only a captured safe selection. Signed attempts live in the existing workbench controller. */
import type { SafeConnection } from '../connection-management.js';
import { removalConfirmation, removalDecision } from '../connection-removal.js';
import type { RemovalConfirmation } from '../connection-removal.js';
import { ConnectionMutationController, MutationStateError } from './controller.js';
import type { MutationView, MutationTimer } from './controller.js';
import type { ConnectionDraft } from './draft.js';
import { decodeSafeConnection } from './wire.js';

export class ConnectionRemovals {
 #controller:ConnectionMutationController;#confirmation:RemovalConfirmation|null=null;#dirty:ConnectionDraft|null=null;
 #listeners=new Set<()=>void>();#subscription:MutationTimer;#disposed=false;
 constructor(controller:ConnectionMutationController){this.#controller=controller;this.#subscription=controller.onChange(()=>this.#emit());}
 get view():{readonly confirmation:RemovalConfirmation|null;readonly resolveDirty:boolean}{return Object.freeze({confirmation:this.#dirty?null:this.#confirmation,resolveDirty:this.#dirty!==null});}
 get records():readonly MutationView[]{return Object.freeze(this.#controller.records.filter(r=>r.mode==='remove'));}
 onChange(listener:()=>void):MutationTimer{this.#admit();this.#listeners.add(listener);return{dispose:()=>{this.#listeners.delete(listener);}};}
 #admit():void{if(this.#disposed)throw new MutationStateError('disposed');}
 #emit():void{for(const listener of [...this.#listeners])try{listener();}catch{/* A closed view cannot affect an operation. */}}
 begin(row:SafeConnection,draft?:ConnectionDraft):void {
  this.#admit();const selected=decodeSafeConnection(row);
  if(this.#controller.isBlocked(selected.key))throw new MutationStateError('busy');
  if(this.#confirmation||draft?.view.confirmDiscard)throw new MutationStateError('invalid-state');
  const confirmation=removalConfirmation(selected.key,selected.revision);
  if(draft?.dirty){
   draft.requestExit({type:'remove',key:confirmation.key,revision:confirmation.expectedRevision});this.#dirty=draft;
  }
  this.#confirmation=confirmation;this.#emit();
 }
 resolveDirty(decision:'discard'|'cancel'):void {
  this.#admit();const draft=this.#dirty,confirmation=this.#confirmation;
  if(!draft||!confirmation)throw new MutationStateError('invalid-state');
  const effects=draft.decideDiscard(decision);this.#dirty=null;
  if(decision==='cancel'||effects.length!==1||effects[0]?.target.type!=='remove')this.#confirmation=null;
  this.#emit();
 }
 async decide(decision:'confirm'|'cancel'):Promise<MutationView|undefined>{
  this.#admit();if(this.#dirty||!this.#confirmation)throw new MutationStateError('invalid-state');
  const captured=this.#confirmation,selection=removalDecision(captured,decision);this.#confirmation=null;this.#emit();
  return selection?await this.#controller.remove(selection):undefined;
 }
 /** Closing a confirmation/view sends nothing and leaves any already-issued operation card intact. */
 cancel():void {
  this.#admit();if(this.#dirty)try{this.#dirty.decideDiscard('cancel');}catch{/* Owner may already have erased the form. */}
  this.#dirty=null;this.#confirmation=null;this.#emit();
 }
 dispose():void{if(this.#disposed)return;this.cancel();this.#disposed=true;this.#subscription.dispose();this.#listeners.clear();}
}
