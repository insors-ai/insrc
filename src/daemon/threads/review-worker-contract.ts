/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isAbsolute, resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { MessagePort } from 'node:worker_threads';
import type { DaemonWorkerInit } from './worker-entry.js';

export const REVIEW_BOOTSTRAP_MS=30_000;
export interface ReviewWorkerIdentity {readonly key:ReviewKey;readonly incarnation:string;}
export interface ReviewBootstrapInput extends ReviewWorkerIdentity {
 readonly attempt:number;readonly reviewer:'daemon'|'controller';readonly actionId:string;
 /** The family's exact bounded submission, not a prepared source context. */
 readonly submitted:unknown;
 /** Host-resolved artifact route; never a provider/socket/closure. */
 readonly epicHash?:string|undefined;
 readonly operation?:'start'|'resume'|undefined;
 /** Reopen stored evidence for model-free observation/publication/cleanup. */
 readonly maintenance?:true|undefined;
 readonly subject?:string|undefined;
 /** Lookup hints only; the host resolves party/scope from tracked records. */
 readonly route?:{readonly epicHash?:string;readonly storyId?:string;readonly artifactPath?:string;readonly client?:'claude'|'codex'|'vibe'}|undefined;
}
export interface ReviewWorkerInit extends DaemonWorkerInit {
 readonly role:'review';readonly review:ReviewBootstrapInput;readonly nativePort:MessagePort;
}
export interface ReviewAdmissionReceipt extends ReviewWorkerIdentity {
 readonly kind:'review-admission-saved';readonly attempt:number;readonly checkpointPath:string;
 readonly progress?:import('./review-progress.js').ReviewProgressPublication|undefined;
}
export function assertReviewIdentity(value:ReviewWorkerIdentity):void{
 if(!Value.Check(ReviewKeySchema,value.key)||!isAbsolute(value.key.project)||resolve(value.key.project)!==value.key.project||!value.incarnation||value.incarnation.length>128||/[\x00-\x1f\x7f]/.test(value.incarnation))throw new Error('Invalid review worker identity');
}
export function sameReviewWorker(expected:ReviewWorkerIdentity,actual:ReviewWorkerIdentity):boolean{return expected.incarnation===actual.incarnation&&isDeepStrictEqual(expected.key,actual.key);}
export function reviewWorkerCheckpoint(key:ReviewKey):string{return join(key.project,'.insrc/tmp',key.family==='code'?'code-review':'design-review',`${key.reviewId}.json`);}
