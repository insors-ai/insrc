/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { digestValue,freezeValue,snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import { readApprovedEvidence } from './review-investigation-approval.js';
import type { CanonicalReviewWorkAdapter } from './review-investigation-work.js';
const id=z.string().min(1).max(256),digest=z.string().regex(/^[a-f0-9]{64}$/),oid=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),n=z.number().int().nonnegative();
const refs=z.array(id).max(4096);
export const evaluationOracleSchema=z.object({version:z.literal(1),kind:z.literal('review-investigation-oracle'),fixtureVersion:id,
 cases:z.array(z.object({caseId:id,description:z.string().min(1).max(4096),before:z.string().min(1).max(16000),after:z.string().min(1).max(16000),probe:z.string().min(1).max(4096),expected:z.unknown(),requiredDefects:refs,requiredCoverage:refs}).strict()).min(1).max(128)}).strict();
export type EvaluationOracle=z.infer<typeof evaluationOracleSchema>;
export const evaluationBindingSchema=z.object({sourceCommit:oid,sourceDigest:digest,profileDigest:digest,policyDigest:digest,catalogDigest:digest,schemaVersion:z.literal(1),adapterVersion:id,fixtureVersion:id,oracleDigest:digest}).strict();
export type EvaluationBinding=z.infer<typeof evaluationBindingSchema>;
const recordBodySchema=z.object({version:z.literal(1),kind:z.literal('review-evaluation-record'),origin:z.enum(['deterministic-fixture','provider-script','recorded-fixture']),producerId:id,recordedRef:id,binding:evaluationBindingSchema,
 observations:z.array(z.object({caseId:id,foundDefects:refs,covered:refs,unverified:refs}).strict()).max(128),
 calls:z.array(z.object({input:z.array(z.object({digest,chars:n.max(10000000)}).strict()).max(256)}).strict()).max(512),harnessElapsedMs:n.nullable(),actualModelCalls:z.null(),actualTokens:z.null(),actualCloudLatencyMs:z.null()}).strict();
export const evaluationRecordSchema=recordBodySchema.extend({recordDigest:digest}).strict();
export type EvaluationRecord=z.infer<typeof evaluationRecordSchema>;
export interface VerifiedEvaluationOracle {readonly oracle:EvaluationOracle;readonly oracleDigest:string;readonly adjudicationRef:string;readonly adjudicationDigest:string;}
const issued=new WeakMap<VerifiedEvaluationOracle,{adjudicatorId:string}>();
function fail(message:string):never{throw new ReviewIntegrationError('not-ready',message);}
function unique(values:readonly string[],what:string){if(new Set(values).size!==values.length)fail(`Duplicate ${what}`);}
function validateOracle(raw:unknown):EvaluationOracle{
 const oracle=evaluationOracleSchema.parse(raw);unique(oracle.cases.map(c=>c.caseId),'oracle case');
 unique(oracle.cases.flatMap(c=>c.requiredDefects),'required defect');unique(oracle.cases.flatMap(c=>c.requiredCoverage),'required coverage');
 if(!oracle.cases.flatMap(c=>c.requiredDefects).length||!oracle.cases.flatMap(c=>c.requiredCoverage).length)fail('Oracle must declare required defects and coverage');return oracle;
}
/** Independent human approval is taken from verified canonical history, never
 * an adjudicator string supplied by the candidate/LLM in a report. */
export async function readApprovedEvaluationOracle(work:CanonicalReviewWorkAdapter,reference:string):Promise<VerifiedEvaluationOracle>{
 const head=await readApprovedEvidence(work,reference),match=/^approved:(.+)@/.exec(reference)!,artifact=decodeArtifactHead(match[1]!,JSON.stringify(head.head)).artifact;
 const author=artifact.lifecycle.revision.by,adjudicator=artifact.lifecycle.approval?.by;
 if(!adjudicator||adjudicator.kind!=='person'||adjudicator.id===author.id)fail('Fixture oracle requires independent person adjudication');
 const data=head.head.body['fixIntent'];if(typeof data!=='string')fail('Oracle must be canonical ISSUE content');
 const oracle=validateOracle(JSON.parse(data)),value=freezeValue({oracle,oracleDigest:digestValue(oracle),adjudicationRef:reference,adjudicationDigest:digestValue({reference,author,adjudicator,oracle})});issued.set(value,{adjudicatorId:adjudicator.id});return value;
}
export function recordEvaluation(input:Omit<EvaluationRecord,'recordDigest'>):EvaluationRecord{
 const body=recordBodySchema.parse(snapshotValue(input));return freezeValue({...body,recordDigest:digestValue(body)});
}
export function scriptedEvaluationRecord(binding:EvaluationBinding,observations:EvaluationRecord['observations'],inputs:readonly (readonly string[])[],recordedRef:string):EvaluationRecord{
 return recordEvaluation({version:1,kind:'review-evaluation-record',origin:'provider-script',producerId:'insrc:scripted-fixture',recordedRef,binding,observations,calls:inputs.map(parts=>({input:parts.map(text=>({digest:digestValue(text),chars:text.length}))})),harnessElapsedMs:null,actualModelCalls:null,actualTokens:null,actualCloudLatencyMs:null});
}
function checkedRecord(raw:unknown,oracle:VerifiedEvaluationOracle):EvaluationRecord{
 const record=evaluationRecordSchema.parse(snapshotValue(raw)),{recordDigest,...body}=record;
 if(record.producerId===issued.get(oracle)?.adjudicatorId)fail('Candidate/baseline producer cannot adjudicate its own oracle');
 if(digestValue(body)!==recordDigest||record.binding.oracleDigest!==oracle.oracleDigest||record.binding.fixtureVersion!==oracle.oracle.fixtureVersion)fail('Evaluation record identity or oracle/fixture binding changed');
 unique(record.observations.map(o=>o.caseId),'record case');
 if(digestValue(record.observations.map(o=>o.caseId).sort())!==digestValue(oracle.oracle.cases.map(c=>c.caseId).sort()))fail('Every oracle case must remain in both records');
 for(const observation of record.observations){unique(observation.foundDefects,'finding');unique(observation.covered,'coverage');unique(observation.unverified,'unverified reference');}
 const lengths=new Map<string,number>();for(const call of record.calls)for(const part of call.input){const prior=lengths.get(part.digest);if(prior!==undefined&&prior!==part.chars)fail('Conflicting repeated-input digest/length');lengths.set(part.digest,part.chars);}
 return record;
}
function metrics(record:EvaluationRecord){const seen=new Set<string>();let inputCharacters=0,repeatedInputCharacters=0;for(const call of record.calls)for(const part of call.input){inputCharacters+=part.chars;if(seen.has(part.digest))repeatedInputCharacters+=part.chars;seen.add(part.digest);}return {basis:record.origin,scriptedOrRecordedCalls:record.calls.length,inputCharacters,repeatedInputCharacters,harnessElapsedMs:record.harnessElapsedMs,actualModelCalls:null,actualTokens:null,actualCloudLatencyMs:null};}
/** This is a labelled protocol/fixture comparison, never a real recall/cost
 * benchmark. Cheaper/fewer calls cannot waive a single required oracle row. */
export function evaluateReviewRecords(oracle:VerifiedEvaluationOracle,baselineRaw:unknown,candidateRaw:unknown){
 if(!issued.has(oracle))fail('Unverified or serialized oracle authority');
 const baseline=checkedRecord(baselineRaw,oracle),candidate=checkedRecord(candidateRaw,oracle);
 const requiredDefects=oracle.oracle.cases.flatMap(c=>c.requiredDefects),requiredCoverage=oracle.oracle.cases.flatMap(c=>c.requiredCoverage);
 const foundDefects=candidate.observations.flatMap(o=>o.foundDefects),covered=candidate.observations.flatMap(o=>o.covered),missingEvidence:string[]=[];
 for(const expected of oracle.oracle.cases){const actual=candidate.observations.find(o=>o.caseId===expected.caseId)!,prior=baseline.observations.find(o=>o.caseId===expected.caseId)!;
  for(const id of prior.foundDefects)if(!expected.requiredDefects.includes(id))missingEvidence.push(`baseline-needs-adjudication:${id}`);
  for(const id of prior.covered)if(!expected.requiredCoverage.includes(id))missingEvidence.push(`baseline-unknown-coverage:${id}`);
  for(const id of expected.requiredDefects)if(!actual.foundDefects.includes(id))missingEvidence.push(`missing-defect:${id}`);
  for(const id of expected.requiredCoverage)if(!actual.covered.includes(id))missingEvidence.push(`missing-coverage:${id}`);
  for(const id of actual.foundDefects)if(!expected.requiredDefects.includes(id))missingEvidence.push(`needs-adjudication:${id}`);
  for(const id of actual.covered)if(!expected.requiredCoverage.includes(id))missingEvidence.push(`unknown-coverage:${id}`);
  missingEvidence.push(...actual.unverified.map(id=>`unverified:${id}`));
 }
 const binding=candidate.binding;
 return freezeValue({version:1 as const,kind:'review-investigation-evaluation' as const,sourceCommit:binding.sourceCommit,sourceDigest:binding.sourceDigest,profileDigest:binding.profileDigest,policyDigest:binding.policyDigest,catalogDigest:binding.catalogDigest,
  fixtureVersion:binding.fixtureVersion,oracleDigest:oracle.oracleDigest,adjudicationRef:oracle.adjudicationRef,adjudicationDigest:oracle.adjudicationDigest,
  requiredDefects,foundDefects,requiredCoverage,covered,missingEvidence,baselineRecord:baseline,candidateRecord:candidate,metrics:{baseline:metrics(baseline),candidate:metrics(candidate)},
  passed:missingEvidence.length===0,claims:{scope:'deterministic-fixture-only',realDefectRecall:null,cloudTokenSavings:null,defaultQuality:null},liveEvidence:false as const,defaultReplacement:false as const});
}
/** Recompute persisted evaluation rather than trusting its passed flag, reduced
 * expected-ID list, counter totals or self-labelled adjudication. */
export function verifyStoredEvaluation(raw:unknown,oracle:VerifiedEvaluationOracle){
 const value=snapshotValue(raw) as Record<string,unknown>,expected=evaluateReviewRecords(oracle,value['baselineRecord'],value['candidateRecord']);
 if(digestValue(value)!==digestValue(expected)||!expected.passed)fail('Stored evaluation is incomplete, altered or unadjudicated');return expected;
}
