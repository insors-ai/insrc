/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ReviewRecoveryV1 } from '../workflow/code-review/investigation/recovery-types.js';
import type { ReviewCompletionReceiptV1 } from '../workflow/code-review/investigation/completion-types.js';

export const INVESTIGATION_ENGINE = 'plan-investigation-v1';
export const INVESTIGATION_WIRE_VERSION = 1;
export interface ReviewClientStatusV1 {
 readonly version: 1; readonly engine: 'plan-investigation-v1' | 'legacy';
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly state: ReviewRecoveryV1['state']; readonly coverageRef: string;
 readonly covered: number; readonly required: number; readonly unresolved: readonly string[];
 readonly resume: { readonly available: boolean; readonly reason: string | null };
 readonly consumption: { readonly reportedRef: string | null; readonly estimatedInputTokens: number | null;
  readonly unavailableAttempts: number; readonly activeMs: number; readonly continuationCount: number };
 readonly receipt: ReviewCompletionReceiptV1 | null;
 readonly error: { readonly code: string; readonly retryable: boolean } | null;
}
export interface ReviewInvestigationDiagnosticsV1 {
 readonly version: 1; readonly coverageUnit: 'obligation-row' | 'legacy-dimension';
 readonly checkpointDigest: string | null;
 readonly latestBlockReceipt: import('../workflow/code-review/investigation/continuation-types.js').BlockCheckpointReceiptV1 | null;
 readonly outstandingBlockIds: readonly string[]; readonly providerLivenessAt: string | null;
 readonly usage: { readonly pendingAttempts: number; readonly estimatedAttempts: number; readonly unavailableAttempts: number };
 readonly allowance: {readonly inclusiveTokenLimit:number;readonly attemptMs:number;readonly activeLimitMs:number;readonly attemptLimit:number};
 readonly preflight: {readonly estimatedInputTokens:number|null;readonly uncertainty:readonly string[]};
}
export interface ReviewInvestigationCapabilitiesV1 {
 readonly version: 1; readonly engines: readonly ('legacy' | 'plan-investigation-v1')[];
 readonly investigationWireVersions: readonly number[]; readonly canonicalInvestigationVersions: readonly number[];
 readonly operations: readonly ReviewInvestigationCommand['operation'][];
}
export class ReviewIntegrationError extends Error {
 constructor(readonly code:'invalid-command'|'unsupported-version'|'not-ready'|'identity-conflict'|'unsupported-backend',message:string){super(message);this.name='ReviewIntegrationError';}
}

const obj=<T extends Record<string,TSchema>>(properties:T)=>Type.Object(properties,{additionalProperties:false});
const text=Type.String({minLength:1,maxLength:4096});
const id=Type.String({minLength:1,maxLength:128,pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]*$'});
const digest=Type.String({pattern:'^[a-f0-9]{64}$'});
const oid=Type.String({pattern:'^[a-f0-9]{40}$'});
const n=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
const refs=Type.Array(text,{maxItems:10000,uniqueItems:true});
const choices=<const T extends string>(values:readonly T[])=>Type.Union(values.map(v=>Type.Literal(v)));
const finding=obj({findingId:text,criterion:text,severity:choices(['HIGH','MED','LOW']),confidence:choices(['breach','observation']),evidenceIds:refs,expectationRefs:refs,message:Type.String({minLength:1,maxLength:16000})});
const coverage=obj({rowId:text,subjectDigest:digest,requirementRef:text,category:choices(['task','acceptance','design','change','criterion','impact']),
 disposition:choices(['pending','satisfied','finding','unverified','not-applicable']),evidenceIds:refs,findingIds:refs,rationale:Type.String({maxLength:16000}),assessedByAttempt:Type.Union([text,Type.Null()])});
export const InvestigationProgressSchema=obj({runId:id,subjectDigest:digest,generation:n,attemptId:text,progressId:text,expectedSequence:n,blockId:text,
 disposition:choices(['reviewed','needs-followup','unverified']),evidenceIds:refs,notes:Type.String({minLength:1,maxLength:16000}),
 coverageUpdates:Type.Array(coverage,{maxItems:10000}),findings:Type.Array(finding,{maxItems:10000}),outstandingWork:refs});
export const InvestigationReplySchema=obj({runId:id,subjectDigest:digest,generation:n,attemptId:text,acceptedBlockReceiptIds:refs,lastAcceptedSequence:n,
 inspectedEvidenceIds:refs,coverageUpdates:Type.Array(coverage,{maxItems:10000}),findings:Type.Array(finding,{maxItems:10000}),
 next:obj({kind:choices(['continue','request-completion','pause']),remainingWork:refs,reason:text})});
const common={version:Type.Literal(1),engine:Type.Literal(INVESTIGATION_ENGINE),repo:text};
const run={...common,runId:id};
const bound={...run,bindingId:text,subjectDigest:digest,generation:n,attemptId:text,requestDigest:digest};
const selection=obj({commitId:oid,parentId:oid,attestationRef:text,blockIds:Type.Optional(Type.Array(text,{minItems:1,maxItems:10000,uniqueItems:true}))});
/** Transport admission only; semantic authority, approved pins and provenance are checked by domain adapters. */
export const ReviewInvestigationCommandSchema=Type.Union([
 obj({...common,operation:Type.Literal('start'),requestId:Type.String({pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'}),
  repoId:text,rootArtifactId:text,storyId:text,buildArtifactId:text,selections:Type.Array(selection,{minItems:1,maxItems:1000}),sourceMode:choices(['source-only','indexed-impact'])}),
 obj({...run,operation:Type.Literal('status')}),obj({...run,operation:Type.Literal('resume')}),
 obj({...run,operation:Type.Literal('cancel'),reason:text}),
 obj({...bound,operation:Type.Literal('read'),reference:text}),
 obj({...bound,operation:Type.Literal('impact'),entityRef:text}),
 obj({...bound,operation:Type.Literal('progress'),progress:InvestigationProgressSchema}),
 obj({...bound,operation:Type.Literal('reply'),reply:InvestigationReplySchema})
]);
export type ReviewInvestigationCommand=Static<typeof ReviewInvestigationCommandSchema>;
export function parseReviewInvestigationCommand(input:unknown):ReviewInvestigationCommand{
 // IPC/MCP supplies decoded JSON. Bound the complete payload before walking nested schema collections.
 let encoded:string;
 try{encoded=JSON.stringify(input)??'';}catch{throw new ReviewIntegrationError('invalid-command','Investigation command is not JSON.');}
 if(Buffer.byteLength(encoded,'utf8')>1024*1024)throw new ReviewIntegrationError('invalid-command','Investigation command exceeds transport limit.');
 if(!Value.Check(ReviewInvestigationCommandSchema,input))throw new ReviewIntegrationError('invalid-command','Invalid investigation command engine, version, operation or fields.');
 return Value.Clone(input);
}

/** References are verified by the daemon readiness adapter, never accepted from a start command/config boolean. */
export interface InvestigationReadinessEvidence {
 readonly compatibleReadersRef:string; readonly qualifiedBackendRef:string; readonly approvedReconciliationRef:string; readonly evaluationRef:string;
}
export function selectReviewInvestigationEngine(configured:unknown,evidence?:InvestigationReadinessEvidence):{readonly engine:'legacy'|'plan-investigation-v1';readonly admitted:boolean;readonly reasons:readonly string[]}{
 if(configured===undefined||configured==='legacy')return {engine:'legacy',admitted:true,reasons:[]};
 if(configured!==INVESTIGATION_ENGINE)throw new ReviewIntegrationError('unsupported-version','Unsupported code-review engine selection.');
 const reasons=(['compatibleReadersRef','qualifiedBackendRef','approvedReconciliationRef','evaluationRef'] as const)
  .filter(key=>!evidence?.[key]?.trim()).map(key=>`Missing verified ${key}.`);
 return {engine:INVESTIGATION_ENGINE,admitted:reasons.length===0,reasons};
}
