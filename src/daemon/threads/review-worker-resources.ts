/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewProcessReservation,ReviewIntentReceipt,ConfirmedReviewLeaseClosure } from '../../shared/review-native.js';
import { validateReviewResourceGuard } from '../../shared/review-resources.js';
import type { ReviewResourceGuard } from '../../shared/review-resources.js';
import { updateStoredCodeCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { isCodeAdmission } from '../../workflow/code-review/task-review/contracts.js';
import { isDesignAdmission } from '../../workflow/review/design-review/contracts.js';
import { updateStoredDesignCheckpoint } from '../../workflow/review/design-review/checkpoint.js';
import type { ReviewWorkerIdentity } from './review-worker-contract.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';

type Lease=ReviewResourceGuard['openLeases'][number];
const openLease=(r:ReviewProcessReservation):Lease=>({operationId:r.operationId,workerIncarnation:r.workerIncarnation,kind:r.kind,openedAt:r.openedAt});
/** Invoked only by the registered main control port. No native work or source
 * qualification occurs here; all changes use the existing family save lane. */
export async function updateReviewWorkerResource(identity:ReviewWorkerIdentity,operation:'open'|'close',r:ReviewProcessReservation,closure?:ConfirmedReviewLeaseClosure):Promise<ReviewIntentReceipt>{
 if(!same(r.key,identity.key)||r.workerIncarnation!==identity.incarnation)throw new Error('Foreign resource mutation');
 if(operation==='close'&&(!closure||closure.disposal.state!=='confirmed'||!same(closure.reservation,r)))throw new Error('Host-confirmed disposal required');
 const lease=openLease(r),path=reviewWorkerCheckpoint(identity.key);let attempt=0,sourceValidation:'unverified'|'qualified'='unverified';
 const guardFor=(attempts:readonly object[]):ReviewResourceGuard=>{
  for(const a of attempts){const g=Reflect.get(a,'resourceGuard') as ReviewResourceGuard|undefined;if(g?.openLeases.some(l=>g.daemonInstance!==r.daemonInstance||l.workerIncarnation!==r.workerIncarnation))throw new Error('Unresolved earlier review resources');}
  const current=Reflect.get(attempts.at(-1)!,'resourceGuard') as ReviewResourceGuard|undefined;
  const guard:ReviewResourceGuard=current?structuredClone(current):{daemonInstance:r.daemonInstance,openLeases:[]};
  if(guard.daemonInstance!==r.daemonInstance){if(guard.openLeases.length)throw new Error('Review resources fenced');guard.daemonInstance=r.daemonInstance;}
  const old=guard.openLeases.find(l=>l.operationId===r.operationId);
  if(old&&!same(old,lease))throw new Error('Conflicting native lease replay');
  if(operation==='open'){if(!old)guard.openLeases.push(lease);}else{if(!old)throw new Error('Native closure has no saved intent');guard.openLeases=guard.openLeases.filter(l=>l.operationId!==r.operationId);}
  validateReviewResourceGuard(guard,identity.key);return guard;
 };
 if(identity.key.family==='code')await updateStoredCodeCheckpoint(path,current=>{
  if(!current||current.project!==identity.key.project||current.reviewId!==identity.key.reviewId)throw new Error('Review admission missing');
  const last=current.attempts.at(-1)!;attempt=last.header.attempt;sourceValidation=isCodeAdmission(last)?'unverified':'qualified';const guard=guardFor(current.attempts);
  return{...current,schemaVersion:2,attempts:current.attempts.map((a,i)=>i===current.attempts.length-1?{...a,resourceGuard:guard}:a)};
 });
 else await updateStoredDesignCheckpoint(identity.key.project,identity.key.reviewId,current=>{
  if(!current)throw new Error('Review admission missing');const last=current.attempts.at(-1)!;attempt=last.number;sourceValidation=isDesignAdmission(last)?'unverified':'qualified';const guard=guardFor(current.attempts);
  return{...current,schemaVersion:2,attempts:current.attempts.map((a,i)=>i===current.attempts.length-1?{...a,resourceGuard:guard}:a)};
 },operation==='close'?[lease]:[]);
 return{checkpointPath:path,attempt,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance,sourceValidation};
}
