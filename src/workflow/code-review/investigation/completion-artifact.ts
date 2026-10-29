/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { assessReviewCompletion } from './completion-assessment.js';
import { RecoveryError } from './recovery-types.js';
import { ledgerSnapshot } from './ledger-identity.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';
import { foldCounts, foldVerdict, validateArtifact } from '../record-validation.js';
import { CODE_REVIEW_SCHEMA_VERSION } from '../types.js';
import type { CodeReviewArtifact, CodeReviewBody, DimensionFinding, ReviewDimension } from '../types.js';
import type { RecoveryView } from './recovery-replay.js';
import type { CompletionValidationContext } from './completion-types.js';

export interface CompletionArtifactInput {
 readonly view: RecoveryView; readonly context: CompletionValidationContext;
 readonly linkage: NonNullable<CodeReviewBody['investigation']>;
 readonly repoPath: string; readonly epicHash: string; readonly storyId: string;
 readonly buildRecord: {readonly meta: {readonly revision: number}; readonly body: {readonly commit: string}};
 readonly createdAt: string; readonly model: string;
}
const DIMENSIONS: readonly ReviewDimension[] = ['adherence','conventions','coverage','quality','functional-coverage','diagram','ux'];

/** Pure projection also used to verify frozen candidates against authoritative accepted findings. */
export function acceptedInvestigationDimensions(view:RecoveryView){
 return view.basis.criteria.map(c => {
  if (!DIMENSIONS.includes(c.id as ReviewDimension)) throw new RecoveryError('unsupported',`Unmappable criterion ${c.id}.`);
  const dimension = c.id as ReviewDimension;
  const findings: DimensionFinding[] = view.state.ledger.findings.filter(f => f.criterion === c.id).map(f => {
   const evidence = f.evidenceIds.map(id => view.state.ledger.evidence.find(e => e.evidenceId === id));
   const located = evidence.find(e => e?.role === 'changed-scope') ?? evidence.find(e => e?.source.path);
   if (!located) throw new RecoveryError('invalid-input',`Unmappable finding location ${f.findingId}.`);
   return {dimension, findingId:f.findingId, severity:f.severity, confidence:f.confidence,
    location:located.source.lines ? `${located.source.path}:${located.source.lines[0]}` : located.source.path,
    message:f.message, evidenceIds:f.evidenceIds, expectationRefs:f.expectationRefs, expectationRef:f.expectationRefs.join(', ')};
  });
  return {dimension,findings};
 });
}

/** Canonical adaptation only: does not execute a judge, write an artifact or approve anything. */
export async function adaptInvestigationReview(input: CompletionArtifactInput): Promise<CodeReviewArtifact> {
 const {view,context,linkage} = input;
 const assessment = await assessReviewCompletion(view,context);
 if (assessment.outcome !== 'publishable') throw new RecoveryError(assessment.outcome === 'stale' ? 'stale' : 'invalid-input', assessment.reasons.join(' '));
 if (linkage.runId !== assessment.runId || linkage.subjectDigest !== assessment.subjectDigest || linkage.policyDigest !== view.manifest.policyDigest
  || linkage.checkpointDigest !== assessment.checkpointDigest || input.buildRecord.meta.revision !== context.build.revision
  || input.buildRecord.body.commit !== context.build.sourceCommit || input.storyId !== view.basis.subject.storyId
  || context.build.artifactId !== `BUILD-${input.epicHash}-${input.storyId}`)
  throw new RecoveryError('invalid-input','Canonical adaptation identity differs from the accepted review or BUILD.');
 const dimensions = acceptedInvestigationDimensions(view);
 const counts = foldCounts(dimensions);
 const artifact: CodeReviewArtifact = {meta:{workflow:'code-review',runId:view.manifest.runId,repoPath:input.repoPath,
  createdAt:input.createdAt,model:input.model,elapsedMs:view.state.consumedActiveMs,repoIndexedAt:null,schemaVersion:CODE_REVIEW_SCHEMA_VERSION,
  epicHash:input.epicHash,storyId:input.storyId,reviewedBy:context.reviewerParty === 'controller' ? 'controller' : 'daemon'},
  body:{kind:'code-review',epicHash:input.epicHash,storyId:input.storyId,groundingMode:'investigation',investigation:linkage,
   subject:{changedFiles:[...new Set(view.basis.subject.packets.flatMap(p=>p.blocks.flatMap(b=>[b.oldPath,b.newPath].filter((v):v is string=>v!==null))))].sort(),
    buildFingerprint:reviewedBuildFingerprint(input.buildRecord),buildRevision:context.build.revision}, dimensions,counts,verdict:foldVerdict(counts)}};
 const error=validateArtifact(artifact,dimensions.map(d=>d.dimension));
 if(error)throw new RecoveryError('invalid-input',error);
 return ledgerSnapshot(artifact);
}
