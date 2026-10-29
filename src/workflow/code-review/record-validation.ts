/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewVerdict } from '../review/types.js';
import type { CodeReviewArtifact, CodeReviewBody, DimensionResult, ReviewDimension } from './types.js';

/** Explicit new-mode recognition. Unknown versions never inherit a legacy meaning. */
export function validateReviewMode(body: CodeReviewBody): string | null {
 if (body.groundingMode === 'full' || body.groundingMode === 'degraded')
  return body.investigation === undefined ? null : 'Legacy mode cannot carry investigation linkage.';
 const i = body.investigation;
 if (body.groundingMode !== 'investigation' || !i || i.version !== 1) return 'Unsupported review mode or investigation version.';
 if (!['source-only','indexed-impact'].includes(i.sourceMode)) return 'Unsupported investigation source mode.';
 if ([i.operationId,i.runId,i.coverageRef].some(v => typeof v !== 'string' || !v.trim())
  || [i.subjectDigest,i.policyDigest,i.checkpointDigest,i.coverageDigest].some(v => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))) return 'Incomplete investigation linkage.';
 return null;
}

/** Compatibility reader: pre-mode legacy records stay readable; new-mode records must be complete and supported. */
export function reviewRecordGap(review:unknown):string|undefined{
 const r=review as CodeReviewArtifact|undefined,b=r?.body;
 if(!b||typeof b!=='object')return 'The code review has no readable body.';
 if(b.groundingMode===undefined&&b.investigation===undefined)return undefined;
 const modeError=validateReviewMode(b);if(modeError)return modeError;
 if(b.groundingMode!=='investigation')return undefined;
 try{
  if(!Array.isArray(b.dimensions))return 'Investigation dimensions are missing.';
  const known=['adherence','conventions','coverage','quality','functional-coverage','diagram','ux'];
  const ids=b.dimensions.map(d=>d.dimension);
  if(new Set(ids).size!==ids.length||ids.some(id=>!known.includes(id))||['adherence','conventions','coverage','quality'].some(id=>!ids.includes(id as ReviewDimension)))return 'Investigation criterion coverage is incomplete or unsupported.';
  return validateArtifact(r!,ids)??undefined;
 }catch{return 'Investigation record structure cannot be verified.';}
}

/** Count the finding severities across every dimension. */
export function foldCounts(dimensions: readonly DimensionResult[]): { readonly high: number; readonly med: number; readonly low: number } {
	let high = 0, med = 0, low = 0;
	for (const dim of dimensions) {
		for (const f of dim.findings) {
			if (f.severity === 'HIGH') high += 1;
			else if (f.severity === 'MED') med += 1;
			else if (f.severity === 'LOW') low += 1;
		}
	}
	return { high, med, low };
}

/** The verdict fold — mirrors the artifact-review vocabulary VERBATIM: any HIGH
 *  → block, else any MED → warn, else pass (LOW neither warns nor blocks). When
 *  `capAtWarn` is set a would-be `'pass'` is promoted to `'warn'` — the cap NEVER
 *  lowers a `block`/`warn` (it only raises the floor for a clean fold). */
export function foldVerdict(
	counts: { readonly high: number; readonly med: number; readonly low: number },
	capAtWarn = false,
): ReviewVerdict {
	const verdict: ReviewVerdict = counts.high > 0 ? 'block' : counts.med > 0 ? 'warn' : 'pass';
	return capAtWarn && verdict === 'pass' ? 'warn' : verdict;
}

/** In-memory validation of the assembled record — the last gate before the
 *  write. Returns a reason string on failure, or null when the record is sound:
 *  a known kind, the expected dimensions in order, a verdict in the ReviewVerdict
 *  union, and counts consistent with a re-fold of the findings. */
export function validateArtifact(a: CodeReviewArtifact, expectedDims: readonly ReviewDimension[]): string | null {
	const b = a.body;
	const modeError = validateReviewMode(b);
	if (modeError) return modeError;
	if (b.groundingMode === 'investigation' && (b.investigation?.runId !== a.meta.runId
	 || (a.meta.reviewedBy !== 'controller' && a.meta.reviewedBy !== 'daemon')
	 || !Number.isSafeInteger(b.subject.buildRevision) || (b.subject.buildRevision ?? 0) < 1
	 || !/^[a-f0-9]{64}$/.test(b.subject.buildFingerprint ?? ''))) return 'Investigation record lacks authenticated reviewer or BUILD binding.';
	if (b.kind !== 'code-review') return `body.kind is '${String(b.kind)}'`;
	if (b.dimensions.length !== expectedDims.length) {
		return `expected ${expectedDims.length} dimensions, got ${b.dimensions.length}`;
	}
	for (let i = 0; i < expectedDims.length; i += 1) {
		if (b.dimensions[i]?.dimension !== expectedDims[i]) {
			return `dimension[${i}] is '${String(b.dimensions[i]?.dimension)}', expected '${String(expectedDims[i])}'`;
		}
	}
	if (b.verdict !== 'pass' && b.verdict !== 'warn' && b.verdict !== 'block') {
		return `verdict '${String(b.verdict)}' is not in the ReviewVerdict union`;
	}
	const refold = foldCounts(b.dimensions);
	if (refold.high !== b.counts.high || refold.med !== b.counts.med || refold.low !== b.counts.low) {
		return `counts {${b.counts.high},${b.counts.med},${b.counts.low}} disagree with the folded severities {${refold.high},${refold.med},${refold.low}}`;
	}
	// A degraded record is warn-capped: its verdict must never be a bare 'pass'.
	// Re-fold with the same cap so the check is consistent with what was built.
	const expectedVerdict = foldVerdict(refold, b.groundingMode === 'degraded');
	if (b.verdict !== expectedVerdict) {
		return `verdict '${b.verdict}' disagrees with the counts (expected '${expectedVerdict}')`;
	}
	return null;
}

