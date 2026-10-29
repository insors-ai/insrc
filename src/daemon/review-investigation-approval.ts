/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { approvalStateOf } from '../workflow/artifact-core/approval-view.js';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import type { CanonicalReviewWorkAdapter } from './review-investigation-work.js';
import type { HeadSnapshot } from '../workflow/artifact-core/store.js';
function refuse(message:string):never{throw new ReviewIntegrationError('not-ready',message);}
export function approvedEvidenceReference(id:string,head:HeadSnapshot):string{return `approved:${id}@${head.revision}#${digestValue({body:head.head.body,citations:head.head.citations??[]})}`;}
export async function readApprovedEvidence(work:CanonicalReviewWorkAdapter,reference:string){
 const match=/^approved:(.+)@([1-9][0-9]*)#([a-f0-9]{64})$/.exec(reference);if(!match||!ArtifactIds.parse(match[1]!))refuse('A versioned canonical approval reference is required');
 const head=await work.readCanonicalHead(match[1]!);if(!head||head.revision!==Number(match[2])||approvalStateOf(head.head.meta)!=='approved'||approvedEvidenceReference(match[1]!,head)!==reference)refuse('Readiness evidence is missing, draft, stale or edited');
 const lifecycle=decodeArtifactHead(match[1]!,JSON.stringify(head.head)).artifact.lifecycle;if(lifecycle.stale||lifecycle.approval?.revision!==head.revision)refuse('Evidence approval does not cover its current revision');
 if(Buffer.byteLength(JSON.stringify(head.head))>1024*1024)refuse('Readiness evidence exceeds its bound');return head;
}
